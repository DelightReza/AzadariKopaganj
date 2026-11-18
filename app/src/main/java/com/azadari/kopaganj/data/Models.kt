package com.azadari.kopaganj.data

import com.google.gson.annotations.SerializedName

data class AppConfig(
    val channel_name: String = "",
    val latest_video_id: String = "",
    val latest_video_title: String = "",
    val is_live: Boolean = false,
    val popular_video_ids: List<String> = emptyList(),
    val available_months: List<AvailableMonth> = emptyList(),
    val video_json_files: List<String> = emptyList(),
    val post_json_files: List<String> = emptyList()
)

data class AvailableMonth(
    val month_year: String = "",
    val yyyy: String = "",
    val mm: String = "",
    val videos_path: String = "",
    val post_path: String = ""
)

data class LiveNow(
    val is_live: Boolean = false,
    val title: String = "",
    val youtube_id: String = ""
)

data class VideoItem(
    val id: String = "",
    val title: String = "",
    val youtube_id: String = "",
    val published: String = "",
    val thumbnail: String = "",
    val views: Int = 0,
    val is_stream: Boolean = false,
    val is_short: Boolean = false
) {
    val videoId: String get() = youtube_id.ifEmpty { id }
}

data class CommunityPost(
    val id: String = "",
    val date: String = "",
    val title: String = "",
    val text: String = "",
    val image_url: String = "",
    val images: List<String>? = null,
    val link_url: String = ""
)
