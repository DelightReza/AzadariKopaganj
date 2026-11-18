package com.azadari.kopaganj.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Article
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import coil.compose.AsyncImage
import com.azadari.kopaganj.data.ArchiveSnapshot
import com.azadari.kopaganj.data.CommunityPost
import com.azadari.kopaganj.data.VideoItem
import com.azadari.kopaganj.ui.player.TheatrePlayer
import com.azadari.kopaganj.MainActivity
import com.azadari.kopaganj.R

private enum class AppTab(val label: String, val route: String) {
    Home("Home", "home"),
    Live("Live", "live"),
    Videos("Videos", "videos"),
    Posts("Posts", "posts")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AzadariApp(viewModel: ArchiveViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()
    val nav = rememberNavController()
    var globalSearch by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { viewModel.refresh(full = true) }
    LaunchedEffect(state.snapshot) {
        if (state.snapshot != null) {
            MainActivity.consumePendingRoute()?.let { route ->
                if (route.startsWith("watch/") || route == "posts" || route == "live" || route == "videos") {
                    nav.navigate(route) { launchSingleTop = true }
                }
            }
        }
    }
    val backEntry by nav.currentBackStackEntryAsState()
    val route = backEntry?.destination?.route.orEmpty()
    val showBars = !route.startsWith("watch/")

    Scaffold(
        topBar = {
            if (showBars) {
                Masthead(
                    query = globalSearch,
                    onQueryChange = { value ->
                        globalSearch = value
                        if (value.isNotBlank() && route != "videos") {
                            nav.navigate("videos") { launchSingleTop = true }
                        }
                    },
                    onSearch = {
                        nav.navigate("videos") { launchSingleTop = true }
                    },
                    onHome = { nav.navigate("home") { launchSingleTop = true } },
                    onRefresh = { viewModel.refresh(full = true) }
                )
            }
        },
        bottomBar = {
            if (showBars) {
                FloatingSectionDock(route = route, nav = nav)
            }
        }
    ) { padding ->
        val snapshot = state.snapshot
        if (state.loading && snapshot == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (snapshot == null) {
            Box(Modifier.fillMaxSize().padding(padding).padding(24.dp), contentAlignment = Alignment.Center) {
                Text(state.error ?: "No archive available")
            }
        } else {
            NavHost(navController = nav, startDestination = "home", modifier = Modifier.padding(padding)) {
                composable("home") { HomeScreen(snapshot, nav) }
                composable("live") { LiveScreen(snapshot, nav) }
                composable("videos") { VideosScreen(snapshot, nav, globalSearch) }
                composable("posts") { PostsScreen(snapshot) }
                composable("watch/{id}") { entry ->
                    val id = entry.arguments?.getString("id").orEmpty()
                    WatchScreen(snapshot, id, id == "live", nav)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Masthead(
    query: String,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onHome: () -> Unit,
    onRefresh: () -> Unit
) {
    Surface(
        color = MaterialTheme.surfaceContainerLowest,
        tonalElevation = 2.dp,
        shadowElevation = 2.dp
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .height(64.dp)
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            IconButton(onClick = onHome) {
                Image(
                    painter = painterResource(R.drawable.azadari_logo),
                    contentDescription = "Azadari Kopaganj",
                    modifier = Modifier.size(38.dp).clip(RoundedCornerShape(10.dp)),
                    contentScale = ContentScale.Fit
                )
            }
            OutlinedTextField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier.weight(1f).height(48.dp),
                placeholder = { Text("Search Majlis, Nauha, Jashn...", maxLines = 1) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (query.isNotBlank()) {
                        IconButton(onClick = onSearch) {
                            Icon(Icons.Default.Search, contentDescription = "Search")
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(24.dp)
            )
            IconButton(onClick = onRefresh) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh")
            }
        }
    }
}

@Composable
private fun FloatingSectionDock(route: String, nav: NavHostController) {
    Box(
        Modifier.fillMaxWidth().padding(bottom = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            tonalElevation = 6.dp,
            shadowElevation = 12.dp,
            color = MaterialTheme.surfaceContainerHigh
        ) {
            Row(
                Modifier.height(56.dp).padding(horizontal = 6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                AppTab.values().forEach { tab ->
                    val selected = route == tab.route
                    TextButton(
                        onClick = {
                            nav.navigate(tab.route) {
                                launchSingleTop = true
                                popUpTo(nav.graph.startDestinationId) { saveState = true }
                                restoreState = true
                            }
                        },
                        modifier = Modifier.padding(horizontal = 2.dp),
                        colors = androidx.compose.material3.ButtonDefaults.textButtonColors(
                            containerColor = if (selected) MaterialTheme.colorScheme.inverseSurface else androidx.compose.ui.graphics.Color.Transparent,
                            contentColor = if (selected) MaterialTheme.colorScheme.inverseOnSurface else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    ) {
                        Icon(
                            when (tab) {
                                AppTab.Home -> Icons.Default.Home
                                AppTab.Live -> Icons.Default.LiveTv
                                AppTab.Videos -> Icons.Default.VideoLibrary
                                AppTab.Posts -> Icons.Default.Article
                            },
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = if (selected) androidx.compose.ui.graphics.Color(0xFFFF5252) else androidx.compose.ui.graphics.Color.Unspecified
                        )
                        Spacer(Modifier.width(5.dp))
                        Text(tab.label)
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeScreen(snapshot: ArchiveSnapshot, nav: NavHostController) {
    LazyColumn(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp, bottom = 100.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (snapshot.live.is_live) {
            item { LiveCard(snapshot.live.title, snapshot.live.youtube_id) { nav.navigate("watch/live") } }
        }
        item { ShelfHeader("Recent videos", "${snapshot.videos.size} videos") { nav.navigate("videos") } }
        items(snapshot.videos.take(20)) { video -> VideoCard(video) { nav.navigate("watch/${video.videoId}") } }
        item { ShelfHeader("Popular videos", "Most watched recordings") { nav.navigate("videos") } }
        val popular = snapshot.videos.sortedByDescending { it.views }.take(8)
        items(popular) { video -> VideoCard(video) { nav.navigate("watch/${video.videoId}") } }
    }
}

@Composable
private fun LiveScreen(snapshot: ArchiveSnapshot, nav: NavHostController) {
    LazyColumn(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 20.dp, bottom = 100.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            if (snapshot.live.is_live) {
                LiveCard(snapshot.live.title, snapshot.live.youtube_id) { nav.navigate("watch/live") }
            } else {
                Card(Modifier.fillMaxWidth()) {
                    Text("No live broadcast currently.", Modifier.padding(20.dp))
                }
            }
        }
        item { SectionTitle("Live Archive") }
        val liveVideos = snapshot.videos.filter {
            it.is_stream || it.title.contains("live", true) || it.title.contains("jashn", true)
        }
        items(liveVideos) { video -> VideoCard(video) { nav.navigate("watch/${video.videoId}") } }
    }
}

@Composable
private fun VideosScreen(snapshot: ArchiveSnapshot, nav: NavHostController, initialQuery: String) {
    var query by remember(initialQuery) { mutableStateOf(initialQuery) }
    var month by remember { mutableStateOf("all") }
    var topic by remember { mutableStateOf("all") }
    val topics = listOf("all", "jashn", "majlis", "nauha", "qaseeda")
    val videos = snapshot.videos.filter { video ->
        val matchesQuery = query.isBlank() || "${video.title} ${video.videoId} ${video.published}".contains(query, true)
        val matchesMonth = month == "all" || video.published.startsWith(month)
        val matchesTopic = topic == "all" || video.title.contains(topic, true)
        matchesQuery && matchesMonth && matchesTopic
    }.sortedByDescending { it.published }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(160.dp),
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 16.dp, bottom = 100.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Search videos") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                singleLine = true,
                shape = RoundedCornerShape(24.dp)
            )
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { FilterChip(month == "all", { month = "all" }, label = { Text("All") }) }
                items(snapshot.config.available_months) { m ->
                    val key = "${m.yyyy}-${m.mm}"
                    FilterChip(month == key, { month = key }, label = { Text(m.month_year.ifBlank { key }) })
                }
            }
        }
        item(span = { GridItemSpan(maxLineSpan) }) {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(topics) { value ->
                    FilterChip(topic == value, { topic = value }, label = { Text(value.replaceFirstChar { it.uppercase() }) })
                }
            }
        }
        if (videos.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) {
            Text("No videos found.", Modifier.padding(24.dp))
        }
        items(videos) { video -> VideoCard(video) { nav.navigate("watch/${video.videoId}") } }
    }
}

@Composable
private fun PostsScreen(snapshot: ArchiveSnapshot) {
    var month by remember { mutableStateOf("all") }
    var selectedPost by remember { mutableStateOf<CommunityPost?>(null) }
    val posts = snapshot.posts.filter { month == "all" || it.date.startsWith(month) }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(220.dp),
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 16.dp, bottom = 100.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { FilterChip(month == "all", { month = "all" }, label = { Text("All") }) }
                items(snapshot.config.available_months.map { "${it.yyyy}-${it.mm}" }.distinct()) { key ->
                    FilterChip(month == key, { month = key }, label = { Text(key) })
                }
            }
        }
        items(posts) { post -> PostCard(post) { selectedPost = post } }
    }
    selectedPost?.let { PostLightbox(it) { selectedPost = null } }
}

@Composable
private fun WatchScreen(snapshot: ArchiveSnapshot, id: String, isLiveRoute: Boolean, nav: NavHostController) {
    val context = LocalContext.current
    val live = snapshot.live
    val isLive = isLiveRoute || live.is_live && id == live.youtube_id
    val videoId = if (isLive) live.youtube_id else id
    val active = snapshot.videos.firstOrNull { it.videoId == videoId }
    val title = if (isLive) live.title.ifBlank { "Azadari Kopaganj Live" } else active?.title.orEmpty()
    val queue = snapshot.videos.filter { !it.is_short }
    val index = queue.indexOfFirst { it.videoId == videoId }
    val previous = queue.getOrNull(index - 1)
    val next = queue.getOrNull(index + 1)
    Column(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.fillMaxWidth().background(androidx.compose.material3.MaterialTheme.colorScheme.surface)
        ) {
            Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { nav.popBackStack() }) { Text("Back") }
                Spacer(Modifier.width(8.dp))
                Text(if (isLive) "Live Stream" else "Watch", fontWeight = FontWeight.Bold)
            }
            if (videoId.isNotBlank()) {
                TheatrePlayer(
                    videoId = videoId,
                    isShort = active?.is_short == true || title.contains("#short", true),
                    isLive = isLive,
                    hasPrevious = previous != null,
                    hasNext = next != null,
                    onPrevious = { previous?.let { nav.navigate("watch/${it.videoId}") } },
                    onNext = { next?.let { nav.navigate("watch/${it.videoId}") } },
                    onEnded = { next?.let { nav.navigate("watch/${it.videoId}") } },
                    modifier = Modifier.fillMaxWidth()
                )
            }
        }
        LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            item {
                Column(Modifier.padding(16.dp)) {
                    Text(title, style = androidx.compose.material3.MaterialTheme.typography.titleLarge)
                    Spacer(Modifier.height(8.dp))
                    TextButton(onClick = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=$videoId")))
                    }) {
                        Icon(Icons.Default.OpenInNew, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("YouTube")
                    }
                }
            }
            item { SectionTitle("Up Next") }
            items(queue.take(60)) { video -> VideoCard(video) { nav.navigate("watch/${video.videoId}") } }
        }
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        title,
        style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
        fontWeight = FontWeight.Bold
    )
}

@Composable
private fun ShelfHeader(title: String, subtitle: String, onViewAll: () -> Unit) {
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(Modifier.weight(1f)) {
            SectionTitle(title)
            Text(
                subtitle,
                style = androidx.compose.material3.MaterialTheme.typography.bodySmall,
                color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        TextButton(onClick = onViewAll) {
            Text("View all")
            Spacer(Modifier.width(4.dp))
            Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp))
        }
    }
}

@Composable
private fun LiveCard(title: String, youtubeId: String, onPlay: () -> Unit) {
    Card(
        onClick = onPlay,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = androidx.compose.material3.MaterialTheme.colorScheme.surfaceContainerLow)
    ) {
        Column {
            Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f)) {
                AsyncImage(
                    model = "https://img.youtube.com/vi/$youtubeId/hqdefault.jpg",
                    contentDescription = title,
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop
                )
                Surface(
                    modifier = Modifier.align(Alignment.TopStart).padding(12.dp),
                    color = Color(0xFFDC2626),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Row(Modifier.padding(horizontal = 8.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.LiveTv, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(5.dp))
                        Text("LIVE NOW", color = Color.White, style = androidx.compose.material3.MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                }
            }
            Column(Modifier.padding(16.dp)) {
                Text(title.ifBlank { "Azadari Kopaganj Live" }, style = androidx.compose.material3.MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(5.dp))
                Text("Azadari Kopaganj · Active Live Broadcast", style = androidx.compose.material3.MaterialTheme.typography.bodySmall, color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun VideoCard(video: VideoItem, onPlay: () -> Unit) {
    Card(
        onClick = onPlay,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = androidx.compose.material3.MaterialTheme.colorScheme.surface)
    ) {
        Column {
            AsyncImage(
                model = video.thumbnail.ifEmpty { "https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg" },
                contentDescription = video.title,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(topStart = 14.dp, topEnd = 14.dp)),
                contentScale = ContentScale.Crop
            )
            Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp)) {
                Text(video.title, maxLines = 2, overflow = TextOverflow.Ellipsis, fontWeight = FontWeight.Medium, style = androidx.compose.material3.MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(6.dp))
                Text("Azadari Kopaganj", style = androidx.compose.material3.MaterialTheme.typography.bodySmall, color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
                Text("${video.published.take(10)} · ${video.views} views", style = androidx.compose.material3.MaterialTheme.typography.bodySmall, color = androidx.compose.material3.MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun PostCard(post: CommunityPost, onOpen: () -> Unit) {
    val context = LocalContext.current
    val images = (post.images ?: post.image_urls ?: emptyList()).ifEmpty {
        listOf(post.image_url).filter { it.isNotBlank() }
    }
    Card(onClick = onOpen, modifier = Modifier.fillMaxWidth()) {
        if (images.isNotEmpty()) {
            AsyncImage(images.first(), post.title, Modifier.fillMaxWidth().height(220.dp), contentScale = ContentScale.Crop)
        }
        Column(Modifier.padding(14.dp)) {
            Text(post.title, style = androidx.compose.material3.MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(6.dp))
            Text(post.text, maxLines = 5, overflow = TextOverflow.Ellipsis)
            if (post.link_url.isNotBlank()) {
                TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(post.link_url))) }) {
                    Icon(Icons.Default.OpenInNew, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text("Open")
                }
            }
        }
    }
}

@Composable
private fun PostLightbox(post: CommunityPost, onClose: () -> Unit) {
    val images = (post.images ?: post.image_urls ?: emptyList()).ifEmpty {
        listOf(post.image_url).filter { it.isNotBlank() }
    }
    var index by remember { mutableIntStateOf(0) }
    AlertDialog(
        onDismissRequest = onClose,
        confirmButton = { TextButton(onClick = onClose) { Text("Close") } },
        title = { Text(post.title) },
        text = {
            Column {
                if (images.isNotEmpty()) {
                    AsyncImage(images[index], post.title, Modifier.fillMaxWidth().aspectRatio(4f / 3f).clip(RoundedCornerShape(12.dp)), contentScale = ContentScale.Fit)
                }
                if (images.size > 1) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton(onClick = { index = (index - 1).coerceIn(0, images.lastIndex) }) { Text("Previous") }
                        Text("${index + 1}/${images.size}")
                        TextButton(onClick = { index = (index + 1).coerceIn(0, images.lastIndex) }) { Text("Next") }
                    }
                }
            }
        }
    )
}
