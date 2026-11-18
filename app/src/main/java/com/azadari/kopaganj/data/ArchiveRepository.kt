package com.azadari.kopaganj.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.async
import android.content.Context
import com.google.gson.Gson
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
private interface RawArchiveApi {
    @GET("config.json")
    suspend fun config(): AppConfig

    @GET("assets/livenow.json")
    suspend fun live(): LiveNow

}

class ArchiveRepository(private val context: Context) {
    private val gson = Gson()
    private val prefs = context.applicationContext.getSharedPreferences("azadari_archive_cache", Context.MODE_PRIVATE)
    private val base = "https://raw.githubusercontent.com/DelightReza/AzadariKopaganj/main/"

    private val retrofit = Retrofit.Builder()
        .baseUrl(base)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    private val api = retrofit.create(RawArchiveApi::class.java)

    fun loadCached(): ArchiveSnapshot? = runCatching {
        gson.fromJson(prefs.getString("snapshot", null), ArchiveSnapshot::class.java)
    }.getOrNull()

    suspend fun load(monthLimit: Int = 3): ArchiveSnapshot = withContext(Dispatchers.IO) {
        val config = api.config()
        val live = api.live()
        val allVideos = mutableListOf<VideoItem>()
        val allPosts = mutableListOf<CommunityPost>()
        val okHttp = okhttp3.OkHttpClient.Builder().build()

        suspend fun getJson(path: String): String {
            val request = okhttp3.Request.Builder().url(base + path).build()
            okHttp.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw IllegalStateException("Failed to load $path")
                return response.body?.string().orEmpty()
            }
        }

        val videoPaths = config.available_months.take(monthLimit).map { it.videos_path }.ifEmpty {
            config.video_json_files.take(monthLimit)
        }
        val postPaths = config.available_months.take(monthLimit).map { it.post_path }.ifEmpty {
            config.post_json_files.take(monthLimit)
        }
        videoPaths.forEach { path ->
            runCatching {
                val array = gson.fromJson(getJson(path), Array<VideoItem>::class.java)
                allVideos += array
            }
        }
        postPaths.forEach { path ->
            runCatching {
                val array = gson.fromJson(getJson(path), Array<CommunityPost>::class.java)
                allPosts += array
            }
        }
        val snapshot = ArchiveSnapshot(config, live, allVideos.distinctBy { it.videoId }, allPosts.distinctBy { it.id })
        prefs.edit().putString("snapshot", gson.toJson(snapshot)).apply()
        snapshot
    }

    suspend fun loadFull(): ArchiveSnapshot = withContext(Dispatchers.IO) {
        val config = api.config()
        val live = api.live()
        val okHttp = okhttp3.OkHttpClient.Builder().build()

        suspend fun getJson(path: String): String {
            val request = okhttp3.Request.Builder().url(base + path).build()
            okHttp.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return ""
                return response.body?.string().orEmpty()
            }
        }

        val months = config.available_months
        val videoPaths = if (months.isNotEmpty()) months.map { it.videos_path } else config.video_json_files
        val postPaths = if (months.isNotEmpty()) months.map { it.post_path } else config.post_json_files
        val videoAndPosts = kotlinx.coroutines.coroutineScope {
            val videoDeferred = async { videoPaths.mapIndexed { index, path ->
                runCatching {
                    val month = months.getOrNull(index)
                    val key = month?.let { "${it.yyyy}-${it.mm.padStart(2, '0')}" } ?: path.substringAfter("assets/").substringBefore("/")
                    val items = gson.fromJson(getJson(path), Array<VideoItem>::class.java)
                    items.map { item ->
                        item.copy(
                            month_key = item.month_key.ifEmpty { key },
                            month_label = item.month_label.ifEmpty { month?.month_year.orEmpty() }
                        )
                    }
                }.getOrElse { emptyList() }
            }.flatten() }
            val postDeferred = async { postPaths.mapIndexed { index, path ->
                runCatching {
                    val month = months.getOrNull(index)
                    val key = month?.let { "${it.yyyy}-${it.mm.padStart(2, '0')}" } ?: path.substringAfter("assets/").substringBefore("/")
                    val items = gson.fromJson(getJson(path), Array<CommunityPost>::class.java)
                    items.map { post ->
                        post.copy(
                            month_key = post.month_key.ifEmpty { key },
                            month_label = post.month_label.ifEmpty { month?.month_year.orEmpty() }
                        )
                    }
                }.getOrElse { emptyList() }
            }.flatten() }
            videoDeferred.await() to postDeferred.await()
        }
        val videos = videoAndPosts.first.distinctBy { it.videoId }.sortedByDescending { it.published }
        val posts = videoAndPosts.second.distinctBy { it.id }.sortedByDescending { it.date }
        val snapshot = ArchiveSnapshot(
            config,
            LiveNow(live.is_live || config.is_live, live.title.ifEmpty { if (config.is_live) config.latest_video_title else "" }, live.youtube_id.ifEmpty { if (config.is_live) config.latest_video_id else "" }),
            videos,
            posts
        )
        prefs.edit().putString("snapshot", gson.toJson(snapshot)).apply()
        snapshot
    }
}

data class ArchiveSnapshot(
    val config: AppConfig,
    val live: LiveNow,
    val videos: List<VideoItem>,
    val posts: List<CommunityPost>
)
