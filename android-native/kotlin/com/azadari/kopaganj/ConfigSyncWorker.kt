package com.azadari.kopaganj

import android.content.Context
import android.content.SharedPreferences
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit
import org.json.JSONArray
import org.json.JSONObject

class ConfigSyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    data class SimpleVideo(val id: String, val title: String)
    data class SimplePost(val id: String, val title: String, val text: String)

    override fun doWork(): Result {
        val context = applicationContext
        AzadariNotificationHelper.createNotificationChannels(context)
        val cacheBust = System.currentTimeMillis() / 1000L
        val configRaw = fetchText("$RAW_BASE_URL" + "config.json?cb=$cacheBust")
            ?: return Result.retry()
        if (configRaw.isEmpty()) return Result.retry()

        return try {
            val configJson = JSONObject(configRaw)
            val configIsLive = configJson.optBoolean("is_live", false)
            val configLatestVideoId = safeString(configJson.optString("latest_video_id", ""))
            val configLatestVideoTitle = safeString(configJson.optString("latest_video_title", ""))

            var livePath = "assets/livenow.json"
            configJson.optJSONObject("endpoints")?.let {
                normalizeRelativePath(it.optString("live", "")).takeIf(String::isNotEmpty)?.let { path ->
                    livePath = path
                }
            }

            var liveNowFlag = false
            var liveNowId = ""
            var liveNowTitle = ""
            fetchText("$RAW_BASE_URL$livePath?cb=$cacheBust")?.takeIf(String::isNotEmpty)?.let {
                val liveJson = JSONObject(it)
                liveNowFlag = liveJson.optBoolean("is_live", false)
                liveNowId = safeString(liveJson.optString("youtube_id", ""))
                liveNowTitle = safeString(liveJson.optString("title", ""))
            }

            val effectiveIsLive = liveNowFlag || configIsLive
            val effectiveLiveId = liveNowId.ifEmpty { if (configIsLive) configLatestVideoId else "" }
            val effectiveLiveTitle = liveNowTitle.ifEmpty { if (configIsLive) configLatestVideoTitle else "" }

            val videoPaths = ArrayList<String>()
            val postPaths = ArrayList<String>()
            configJson.optJSONArray("available_months")?.let { months ->
                repeat(minOf(2, months.length())) { i ->
                    months.optJSONObject(i)?.let { month ->
                        normalizeRelativePath(month.optString("videos_path", "")).takeIf(String::isNotEmpty)
                            ?.takeUnless(videoPaths::contains)?.let(videoPaths::add)
                        normalizeRelativePath(month.optString("post_path", "")).takeIf(String::isNotEmpty)
                            ?.takeUnless(postPaths::contains)?.let(postPaths::add)
                    }
                }
            }
            if (videoPaths.isEmpty()) {
                configJson.optJSONArray("video_json_files")?.optString(0, "")?.let(::normalizeRelativePath)
                    ?.takeIf(String::isNotEmpty)?.let(videoPaths::add)
            }
            if (postPaths.isEmpty()) {
                configJson.optJSONArray("post_json_files")?.optString(0, "")?.let(::normalizeRelativePath)
                    ?.takeIf(String::isNotEmpty)?.let(postPaths::add)
            }

            val recentVideos = ArrayList<SimpleVideo>()
            val seenVideos = HashSet<String>()
            videoPaths.forEach { path ->
                fetchText("$RAW_BASE_URL$path?cb=$cacheBust")?.takeIf(String::isNotEmpty)?.let { raw ->
                    val array = JSONArray(raw)
                    repeat(array.length()) { i ->
                        array.optJSONObject(i)?.let { item ->
                            val id = safeString(item.optString("youtube_id", "")).ifEmpty {
                                safeString(item.optString("id", ""))
                            }
                            val title = safeString(item.optString("title", "Azadari Kopaganj Video"))
                            if (id.isNotEmpty() && seenVideos.add(id)) recentVideos += SimpleVideo(id, title)
                        }
                    }
                }
            }

            val recentPosts = ArrayList<SimplePost>()
            val seenPosts = HashSet<String>()
            postPaths.forEach { path ->
                fetchText("$RAW_BASE_URL$path?cb=$cacheBust")?.takeIf(String::isNotEmpty)?.let { raw ->
                    val array = JSONArray(raw)
                    repeat(array.length()) { i ->
                        array.optJSONObject(i)?.let { item ->
                            val id = safeString(item.optString("id", ""))
                            val title = safeString(item.optString("title", "Community Update"))
                            val text = safeString(item.optString("text", title))
                            if (id.isNotEmpty() && seenPosts.add(id)) recentPosts += SimplePost(id, title, text)
                        }
                    }
                }
            }

            synchronized(PREFS_LOCK) {
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val initialized = prefs.getBoolean(KEY_INITIALIZED, false)
                val alertsEnabled = prefs.getBoolean(KEY_ALERTS_ENABLED, true)
                val prevIsLive = prefs.getBoolean(KEY_LAST_IS_LIVE, false)
                val prevLiveId = safeString(prefs.getString(KEY_LAST_LIVE_ID, ""))
                val prevLatestVideoId = safeString(prefs.getString(KEY_LAST_LATEST_VIDEO_ID, ""))
                val prevVideoIds = decodeIdList(prefs.getString(KEY_KNOWN_VIDEO_IDS, "[]"))
                val prevPostIds = decodeIdList(prefs.getString(KEY_KNOWN_POST_IDS, "[]"))
                val prevVideoSet = prevVideoIds.toHashSet()
                val prevPostSet = prevPostIds.toHashSet()
                val canNotify = alertsEnabled && AzadariNotificationHelper.canPostNotifications(context)

                if (!initialized) {
                    if (canNotify && effectiveIsLive) {
                        AzadariNotificationHelper.showNotification(
                            context, AzadariNotificationHelper.CHANNEL_LIVE,
                            notificationIdFor("live_$effectiveLiveId"),
                            "Live Now: Azadari Kopaganj",
                            effectiveLiveTitle.ifEmpty { "Live Majlis / Broadcast is streaming now." },
                            "#/watch/live?from=live"
                        )
                    }
                } else if (canNotify) {
                    var emittedLiveAlert = false
                    if (effectiveIsLive && (!prevIsLive || (effectiveLiveId.isNotEmpty() && effectiveLiveId != prevLiveId))) {
                        emittedLiveAlert = true
                        AzadariNotificationHelper.showNotification(
                            context, AzadariNotificationHelper.CHANNEL_LIVE,
                            notificationIdFor("live_$effectiveLiveId"),
                            "Live Now: Azadari Kopaganj",
                            effectiveLiveTitle.ifEmpty { "Live Majlis / Julus broadcast has started." },
                            "#/watch/live?from=live"
                        )
                    }

                    val newVideos = recentVideos.filterNot { it.id in prevVideoSet }.toMutableList()
                    if (emittedLiveAlert && effectiveLiveId.isNotEmpty()) newVideos.removeAll { it.id == effectiveLiveId }
                    if (configLatestVideoId.isNotEmpty() && configLatestVideoId != prevLatestVideoId &&
                        configLatestVideoId !in prevVideoSet && newVideos.none { it.id == configLatestVideoId } &&
                        !(emittedLiveAlert && configLatestVideoId == effectiveLiveId)
                    ) {
                        newVideos.add(0, SimpleVideo(configLatestVideoId, configLatestVideoTitle.ifEmpty {
                            "New upload available on Azadari Kopaganj."
                        }))
                    }
                    if (newVideos.isNotEmpty()) {
                        if (newVideos.size <= 3) newVideos.forEach { video ->
                            AzadariNotificationHelper.showNotification(
                                context, AzadariNotificationHelper.CHANNEL_VIDEO, notificationIdFor("video_${video.id}"),
                                "New Video — Azadari Kopaganj", video.title, "#/watch/${video.id}?from=videos"
                            )
                        } else {
                            AzadariNotificationHelper.showNotification(
                                context, AzadariNotificationHelper.CHANNEL_VIDEO,
                                notificationIdFor("videos_batch_${newVideos.first().id}"),
                                "${newVideos.size} New Videos — Azadari Kopaganj",
                                "${newVideos.first().title} and more uploads available.", "#/videos"
                            )
                        }
                    }

                    val newPosts = recentPosts.filterNot { it.id in prevPostSet }
                    if (newPosts.isNotEmpty()) {
                        if (newPosts.size <= 3) newPosts.forEach { post ->
                            AzadariNotificationHelper.showNotification(
                                context, AzadariNotificationHelper.CHANNEL_POST, notificationIdFor("post_${post.id}"),
                                "New Post: ${post.title}", post.text, "#/posts"
                            )
                        } else {
                            AzadariNotificationHelper.showNotification(
                                context, AzadariNotificationHelper.CHANNEL_POST,
                                notificationIdFor("posts_batch_${newPosts.first().id}"),
                                "${newPosts.size} New Community Posts", newPosts.first().title, "#/posts"
                            )
                        }
                    }
                }

                val mergedVideos = LinkedHashSet<String>().apply {
                    if (configLatestVideoId.isNotEmpty()) add(configLatestVideoId)
                    recentVideos.forEach { add(it.id) }
                    addAll(prevVideoIds)
                }
                val mergedPosts = LinkedHashSet<String>().apply {
                    recentPosts.forEach { add(it.id) }
                    addAll(prevPostIds)
                }
                prefs.edit()
                    .putBoolean(KEY_INITIALIZED, true)
                    .putBoolean(KEY_LAST_IS_LIVE, effectiveIsLive)
                    .putString(KEY_LAST_LIVE_ID, effectiveLiveId)
                    .putString(KEY_LAST_LATEST_VIDEO_ID, configLatestVideoId)
                    .putString(KEY_KNOWN_VIDEO_IDS, encodeIdList(mergedVideos.toList()))
                    .putString(KEY_KNOWN_POST_IDS, encodeIdList(mergedPosts.toList()))
                    .putLong(KEY_LAST_SYNC_MS, System.currentTimeMillis())
                    .apply()
            }
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }

    companion object {
        const val PREFS_NAME = "azadari_bg_sync_prefs"
        const val UNIQUE_WORK_NAME = "azadari_hourly_config_sync"
        const val UNIQUE_IMMEDIATE_WORK_NAME = "azadari_immediate_config_sync"
        const val RAW_BASE_URL = "https://raw.githubusercontent.com/DelightReza/AzadariKopaganj/main/"
        const val KEY_INITIALIZED = "initialized"
        const val KEY_ALERTS_ENABLED = "alerts_enabled"
        const val KEY_LAST_IS_LIVE = "last_is_live"
        const val KEY_LAST_LIVE_ID = "last_live_id"
        const val KEY_LAST_LATEST_VIDEO_ID = "last_latest_video_id"
        const val KEY_KNOWN_VIDEO_IDS = "known_video_ids"
        const val KEY_KNOWN_POST_IDS = "known_post_ids"
        const val KEY_LAST_SYNC_MS = "last_sync_ms"
        const val KEY_PENDING_ROUTE = "pending_route"
        private const val MAX_TRACKED_IDS = 1500
        private val PREFS_LOCK = Any()

        fun scheduleHourlySync(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = PeriodicWorkRequest.Builder(ConfigSyncWorker::class.java, 1, TimeUnit.HOURS)
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, PeriodicWorkRequest.MIN_BACKOFF_MILLIS, TimeUnit.MILLISECONDS)
                .build()
            WorkManager.getInstance(context.applicationContext).enqueueUniquePeriodicWork(
                UNIQUE_WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request
            )
        }

        fun triggerImmediateSync(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = OneTimeWorkRequest.Builder(ConfigSyncWorker::class.java).setConstraints(constraints).build()
            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                UNIQUE_IMMEDIATE_WORK_NAME, ExistingWorkPolicy.REPLACE, request
            )
        }

        fun saveBaseline(context: Context, isLive: Boolean, liveId: String?, latestVideoId: String?,
                         videoIds: List<String>?, postIds: List<String>?) {
            synchronized(PREFS_LOCK) {
                context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                    .putBoolean(KEY_INITIALIZED, true).putBoolean(KEY_LAST_IS_LIVE, isLive)
                    .putString(KEY_LAST_LIVE_ID, safeString(liveId)).putString(KEY_LAST_LATEST_VIDEO_ID, safeString(latestVideoId))
                    .putString(KEY_KNOWN_VIDEO_IDS, encodeIdList(videoIds)).putString(KEY_KNOWN_POST_IDS, encodeIdList(postIds))
                    .putLong(KEY_LAST_SYNC_MS, System.currentTimeMillis()).apply()
            }
        }

        fun setAlertsEnabled(context: Context, enabled: Boolean) {
            synchronized(PREFS_LOCK) {
                context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                    .putBoolean(KEY_ALERTS_ENABLED, enabled).apply()
            }
        }

        fun isAlertsEnabled(context: Context): Boolean =
            context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(KEY_ALERTS_ENABLED, true)

        fun savePendingRoute(context: Context, route: String?) {
            route?.trim()?.takeIf(String::isNotEmpty)?.let {
                context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                    .putString(KEY_PENDING_ROUTE, it).apply()
            }
        }

        fun consumePendingRoute(context: Context): String? {
            val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return prefs.getString(KEY_PENDING_ROUTE, null)?.also { prefs.edit().remove(KEY_PENDING_ROUTE).apply() }
        }

        private fun fetchText(urlString: String): String? {
            var connection: HttpURLConnection? = null
            return try {
                connection = URL(urlString).openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                connection.connectTimeout = 15000
                connection.readTimeout = 15000
                connection.useCaches = false
                connection.setRequestProperty("Accept", "application/json")
                connection.setRequestProperty("Cache-Control", "no-cache, no-store")
                connection.setRequestProperty("Pragma", "no-cache")
                if (connection.responseCode !in 200..299) return null
                BufferedReader(InputStreamReader(connection.inputStream, StandardCharsets.UTF_8)).use { it.readText() }
            } catch (_: Exception) {
                null
            } finally {
                connection?.disconnect()
            }
        }

        private fun normalizeRelativePath(path: String?): String =
            safeString(path).removePrefix("./").trimStart('/')

        private fun safeString(value: String?): String = value?.trim() ?: ""

        private fun notificationIdFor(key: String): Int =
            (key.hashCode().let { if (it == Int.MIN_VALUE) 1001 else it }).let { kotlin.math.abs(it) }

        private fun encodeIdList(ids: Collection<String>?): String {
            val array = JSONArray()
            ids?.asSequence()?.mapNotNull { it.trim().takeIf(String::isNotEmpty) }?.distinct()
                ?.take(MAX_TRACKED_IDS)?.forEach(array::put)
            return array.toString()
        }

        private fun decodeIdList(json: String?): List<String> {
            if (json.isNullOrEmpty()) return emptyList()
            return try {
                val array = JSONArray(json)
                buildList { repeat(array.length()) { i -> safeString(array.optString(i, "")).takeIf(String::isNotEmpty)?.let(::add) } }
            } catch (_: Exception) {
                emptyList()
            }
        }
    }
}
