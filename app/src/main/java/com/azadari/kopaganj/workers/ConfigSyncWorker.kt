package com.azadari.kopaganj.workers

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.azadari.kopaganj.notifications.AzadariNotifications
import com.google.gson.Gson
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class ConfigSyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val base = "https://raw.githubusercontent.com/DelightReza/AzadariKopaganj/main/"
        val client = OkHttpClient()
        fun get(path: String): String? {
            val request = Request.Builder().url(base + path).build()
            client.newCall(request).execute().use { if (!it.isSuccessful) return null; return it.body?.string() }
        }
        val configRaw = get("config.json") ?: return Result.retry()
        val liveRaw = get("assets/livenow.json")
        val gson = Gson()
        val config = gson.fromJson(configRaw, JsonObject::class.java)
        val live = liveRaw?.let { gson.fromJson(it, JsonObject::class.java) } ?: JsonObject()
        val prefs = applicationContext.getSharedPreferences("azadari_sync", Context.MODE_PRIVATE)
        val initialized = prefs.getBoolean("initialized", false)
        val wasLive = prefs.getBoolean("live", false)
        val previousLiveId = prefs.getString("live_id", "")
        val liveNow = live.opt("is_live")?.asBoolean ?: config.opt("is_live")?.asBoolean ?: false
        val liveId = live.opt("youtube_id")?.asString ?: ""
        val liveTitle = live.opt("title")?.asString ?: ""
        val previousVideos = prefs.getStringSet("videos", emptySet()).orEmpty()
        val previousPosts = prefs.getStringSet("posts", emptySet()).orEmpty()
        val videoIds = mutableSetOf<String>()
        val postIds = mutableSetOf<String>()
        val videoSamples = mutableListOf<Pair<String, String>>()
        val postSamples = mutableListOf<Pair<String, String>>()
        val months = config.opt("available_months")?.asJsonArray ?: JsonArray()
        repeat(minOf(2, months.size())) { i ->
            val month = months[i].asJsonObject
            val videoPath = month.opt("videos_path")?.asString
            val postPath = month.opt("post_path")?.asString
            videoPath?.let {
                get(it)?.let { raw ->
                    val array = gson.fromJson(raw, JsonArray::class.java)
                    array.forEach { item ->
                        val obj = item.asJsonObject
                        val id = obj.opt("youtube_id")?.asString ?: obj.opt("id")?.asString ?: ""
                        val title = obj.opt("title")?.asString ?: "New Azadari video"
                        if (id.isNotBlank()) {
                            videoIds += id
                            videoSamples += id to title
                        }
                    }
                }
            }
            postPath?.let {
                get(it)?.let { raw ->
                    val array = gson.fromJson(raw, JsonArray::class.java)
                    array.forEach { item ->
                        val obj = item.asJsonObject
                        val id = obj.opt("id")?.asString ?: ""
                        val title = obj.opt("title")?.asString ?: "Community update"
                        if (id.isNotBlank()) {
                            postIds += id
                            postSamples += id to title
                        }
                    }
                }
            }
        }
        if (initialized) {
            if (liveNow && (!wasLive || (liveId.isNotBlank() && liveId != previousLiveId))) {
                AzadariNotifications.show(applicationContext, AzadariNotifications.LIVE, liveId.hashCode(), "Live Now: Azadari Kopaganj", liveTitle.ifBlank { "Live broadcast started." }, "watch/live")
            }
            videoSamples.filter { it.first !in previousVideos }.take(3).forEach { (id, title) ->
                AzadariNotifications.show(applicationContext, AzadariNotifications.VIDEO, id.hashCode(), "New Video — Azadari Kopaganj", title, "watch/$id")
            }
            postSamples.filter { it.first !in previousPosts }.take(3).forEach { (id, title) ->
                AzadariNotifications.show(applicationContext, AzadariNotifications.POST, id.hashCode(), "New Post: $title", title, "posts")
            }
        }
        prefs.edit()
            .putBoolean("initialized", true)
            .putBoolean("live", liveNow)
            .putString("live_id", liveId)
            .putStringSet("videos", (videoIds + previousVideos).take(1500).toSet())
            .putStringSet("posts", (postIds + previousPosts).take(1500).toSet())
            .apply()
        return Result.success()
    }

    companion object {
        const val UNIQUE_WORK = "azadari_hourly_sync"
        fun schedule(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val request = PeriodicWorkRequestBuilder<ConfigSyncWorker>(1, TimeUnit.HOURS)
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_WORK,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
    }
}

private fun JsonObject.opt(name: String) = if (has(name) && !get(name).isJsonNull) get(name) else null
