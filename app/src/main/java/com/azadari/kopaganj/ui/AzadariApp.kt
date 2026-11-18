package com.azadari.kopaganj.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Article
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.azadari.kopaganj.data.ArchiveRepository
import com.azadari.kopaganj.data.ArchiveSnapshot
import com.azadari.kopaganj.data.CommunityPost
import com.azadari.kopaganj.data.VideoItem

private enum class AppTab(val label: String) {
    Home("Home"), Live("Live"), Videos("Videos"), Posts("Posts")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AzadariApp() {
    val repository = remember { ArchiveRepository() }
    var snapshot by remember { mutableStateOf<ArchiveSnapshot?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    var tab by remember { mutableIntStateOf(0) }
    var query by remember { mutableStateOf("") }
    var reloadKey by remember { mutableIntStateOf(0) }

    suspend fun reload() {
        loading = true
        error = null
        runCatching { repository.load() }.fold(
            { snapshot = it },
            { error = it.message ?: "Could not load archive" }
        )
        loading = false
    }

    LaunchedEffect(reloadKey) { reload() }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text("Azadari Kopaganj", fontWeight = FontWeight.Bold) },
                actions = {
                    IconButton(onClick = { reloadKey++ }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                val tabs = listOf(
                    AppTab.Home to Icons.Default.Home,
                    AppTab.Live to Icons.Default.LiveTv,
                    AppTab.Videos to Icons.Default.VideoLibrary,
                    AppTab.Posts to Icons.Default.Article
                )
                tabs.forEachIndexed { index, item ->
                    NavigationBarItem(
                        selected = tab == index,
                        onClick = { tab = index },
                        icon = { Icon(item.second, contentDescription = item.first.label) },
                        label = { Text(item.first.label) }
                    )
                }
            }
        }
    ) { padding ->
        when {
            loading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            error != null -> Column(
                Modifier.fillMaxSize().padding(padding).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Text(error!!)
            }
            snapshot != null -> {
                val data = snapshot!!
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    if (tab == 0 || tab == 2) {
                        item {
                            OutlinedTextField(
                                value = query,
                                onValueChange = { query = it },
                                modifier = Modifier.fillFill,
                                label = { Text("Search videos") },
                                singleLine = true
                            )
                        }
                    }
                    when (tab) {
                        0 -> {
                            if (data.live.is_live) item { LiveCard(data.live.title, data.live.youtube_id) }
                            item { SectionTitle("Recent Videos") }
                            items(data.videos.take(20)) { video -> VideoCard(video) }
                        }
                        1 -> {
                            item {
                                if (data.live.is_live) LiveCard(data.live.title, data.live.youtube_id)
                                else Card(
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = CardDefaults.cardColors()
                                ) { Text("No live broadcast currently.", modifier = Modifier.padding(20.dp)) }
                            }
                            item { SectionTitle("Live Archive") }
                            items(data.videos.filter { it.is_stream }.take(30)) { video -> VideoCard(video) }
                        }
                        2 -> {
                            val filtered = data.videos.filter {
                                query.isBlank() || it.title.contains(query, ignoreCase = true)
                            }
                            items(filtered) { video -> VideoCard(video) }
                        }
                        3 -> items(data.posts) { post -> PostCard(post) }
                    }
                }
            }
        }
    }
}

private val Modifier.fillFill: Modifier get() = this.fillMaxWidth()

@Composable
private fun SectionTitle(title: String) {
    Text(title, style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
        modifier = Modifier.padding(top = 4.dp))
}

@Composable
private fun LiveCard(title: String, youtubeId: String) {
    val context = LocalContext.current
    Card(
        onClick = {
            val url = if (youtubeId.isNotBlank()) "https://www.youtube.com/watch?v=$youtubeId"
            else "https://www.youtube.com/channel/UCyCIC43pbujKarf1irIjtrA/live"
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        },
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = androidx.compose.material3.MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.LiveTv, contentDescription = null)
            Spacer(Modifier.width(12.dp))
            Column {
                Text("LIVE NOW", fontWeight = FontWeight.Bold)
                Text(title.ifBlank { "Azadari Kopaganj Live" }, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }

        @Composable
        private fun VideoCard(video: VideoItem) {
            val context = LocalContext.current
            Card(
                onClick = {
                    val url = "https://www.youtube.com/watch?v=${video.videoId}"
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    AsyncImage(
                        model = video.thumbnail.ifEmpty {
                            "https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg"
                        },
                        contentDescription = video.title,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(190.dp)
                            .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)),
                        contentScale = ContentScale.Crop
                    )
                    Column(Modifier.padding(14.dp)) {
                        Text(
                            video.title,
                            style = androidx.compose.material3.MaterialTheme.typography.titleMedium,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(Modifier.height(6.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text(
                                video.published.take(10),
                                style = androidx.compose.material3.MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                }
            }
        }

        @Composable
        private fun PostCard(post: CommunityPost) {
            val context = LocalContext.current
            val image = post.images?.firstOrNull()?.ifBlank { null } ?: post.image_url
            Card(
                onClick = {
                    post.link_url.takeIf { it.isNotBlank() }?.let {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it)))
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    if (image.isNotBlank()) {
                        AsyncImage(
                            model = image,
                            contentDescription = post.title,
                            modifier = Modifier.fillMaxWidth().height(200.dp),
                            contentScale = ContentScale.Crop
                        )
                    }
                    Column(Modifier.padding(14.dp)) {
                        Text(
                            post.title,
                            style = androidx.compose.material3.MaterialTheme.typography.titleMedium,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(Modifier.height(6.dp))
                        Text(
                            post.text,
                            style = androidx.compose.material3.MaterialTheme.typography.bodyMedium,
                            maxLines = 4,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }
            }
        }
    }
}
