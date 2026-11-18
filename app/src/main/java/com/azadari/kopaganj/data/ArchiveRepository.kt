package com.azadari.kopaganj.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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

class ArchiveRepository {
    private val retrofit = Retrofit.Builder()
        .baseUrl("https://raw.githubusercontent.com/DelightReza/AzadariKopaganj/main/")
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    private val api = retrofit.create(RawArchiveApi::class.java)

    suspend fun load(): ArchiveSnapshot = withContext(Dispatchers.IO) {
        val config = api.config()
        val live = api.live()
        val allVideos = mutableListOf<VideoItem>()
        val allPosts = mutableListOf<CommunityPost>()
        val okHttp = okhttp3.OkHttpClient.Builder().build()
        val base = "https://raw.githubusercontent.com/DelightReza/AzadariKopaganj/main/"

        suspend fun getJson(path: String): String {
            val request = okhttp3.Request.Builder().url(base + path).build()
            okHttp.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw IllegalStateException("Failed to load $path")
                return response.body?.string().orEmpty()
            }
        }

        val gson = com.google.gson.Gson()
        val videoPaths = config.available_months.map { it.videos_path }.ifEmpty { config.video_json_files }
        val postPaths = config.available_months.map { it.post_path }.ifEmpty { config.post_json_files }
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
        ArchiveSnapshot(config, live, allVideos.distinctBy { it.videoId }, allPosts.distinctBy { it.id })
    }
}

data class ArchiveSnapshot(
    val config: AppConfig,
    val live: LiveNow,
    val videos: List<VideoItem>,
    val posts: List<CommunityPost>
)
