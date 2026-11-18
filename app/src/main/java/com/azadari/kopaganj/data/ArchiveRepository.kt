package com.azadari.kopaganj.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.content.Context
import com.google.gson.Gson
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Path

private interface RawArchiveApi {
    @GET("config.json")
    suspend fun config(): AppConfig

    @GET("assets/livenow.json")
    suspend fun live(): LiveNow

    @GET("{path}")
    suspend fun file(@Path("path", encoded = true) path: String): Any
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
}

data class ArchiveSnapshot(
    val config: AppConfig,
    val live: LiveNow,
    val videos: List<VideoItem>,
    val posts: List<CommunityPost>
)
