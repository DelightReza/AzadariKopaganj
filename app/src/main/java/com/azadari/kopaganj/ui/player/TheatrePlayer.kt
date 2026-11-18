package com.azadari.kopaganj.ui.player

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.ActivityInfo
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloseFullscreen
import androidx.compose.material.icons.filled.Fullscreen
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.delay
import org.json.JSONObject

data class PlayerUiState(
    val currentSeconds: Float = 0f,
    val durationSeconds: Float = 0f,
    val playing: Boolean = false,
    val buffering: Boolean = false,
    val ended: Boolean = false,
    val muted: Boolean = false,
    val speed: Float = 1f,
    val quality: String = "auto",
    val error: String? = null
)

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun TheatrePlayer(
    videoId: String,
    isShort: Boolean,
    isLive: Boolean,
    hasPrevious: Boolean,
    hasNext: Boolean,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onEnded: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val activity = context as? Activity
    var state by remember(videoId) { mutableStateOf(PlayerUiState(buffering = true)) }
    var fullscreen by remember { mutableStateOf(false) }
    var webView by remember { mutableStateOf<WebView?>(null) }

    val bridge = remember(videoId) {
        object : Any() {
            fun post(json: String) {}
        }
    }

    DisposableEffect(activity, isShort, fullscreen) {
        if (fullscreen) {
            activity?.requestedOrientation =
                if (isShort) ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                else ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        }
        onDispose {
            if (fullscreen) activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    val playerModifier = if (fullscreen) {
        Modifier.fillMaxSize().background(Color.Black)
    } else {
        modifier.aspectRatio(if (isShort) 9f / 16f else 16f / 9f)
            .clip(RoundedCornerShape(12.dp))
    }

    Box(playerModifier.background(Color.Black), contentAlignment = Alignment.Center) {
        AndroidView(
            factory = { ctx ->
                WebView(ctx).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.mediaPlaybackRequiresUserGesture = false
                    settings.loadWithOverviewMode = true
                    settings.useWideViewPort = true
                    webChromeClient = WebChromeClient()
                    webViewClient = WebViewClient()
                    addJavascriptInterface(
                        object {
                            @JavascriptInterface
                            fun event(payload: String) {
                                val obj = JSONObject(payload)
                                val type = obj.optString("type")
                                Handler(Looper.getMainLooper()).post {
                                    state = when (type) {
                                        "ready" -> state.copy(buffering = false)
                                        "state" -> {
                                            val playing = obj.optInt("value") == 1
                                            val ended = obj.optInt("value") == 0 && obj.optBoolean("ended", false)
                                            if (ended) onEnded()
                                            state.copy(playing = playing, buffering = obj.optInt("value") == 3, ended = ended)
                                        }
                                        "time" -> state.copy(
                                            currentSeconds = obj.optDouble("current", 0.0).toFloat(),
                                            durationSeconds = obj.optDouble("duration", 0.0).toFloat()
                                        )
                                        "error" -> state.copy(buffering = false, error = "Playback error ${obj.optInt("code", 0)}")
                                        "quality" -> state.copy(quality = obj.optString("value", "auto"))
                                        "speed" -> state.copy(speed = obj.optDouble("value", 1.0).toFloat())
                                        "mute" -> state.copy(muted = obj.optBoolean("value", false))
                                        else -> state
                                    }
                                }
                            }
                        },
                        "AzadariPlayer"
                    )
                    val html = playerHtml(videoId, isLive)
                    loadDataWithBaseURL("https://www.youtube.com", html, "text/html", "utf-8", null)
                    webView = this
                }
            },
            update = { view ->
                if (view.tag != videoId) {
                    view.tag = videoId
                    view.loadUrl("javascript:if(window.azadariLoad)azadariLoad('$videoId', ${isLive})")
                }
            },
            modifier = Modifier.fillMaxSize()
        )

        if (state.buffering) {
            CircularProgressIndicator(color = Color.White)
        }
        if (state.error != null) {
            Text(state.error!!, color = Color.White, modifier = Modifier.padding(16.dp))
        }

        Column(
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                .background(Color.Black.copy(alpha = 0.72f)).padding(horizontal = 8.dp, vertical = 4.dp)
        ) {
            Slider(
                value = if (state.durationSeconds > 0f) state.currentSeconds / state.durationSeconds else 0f,
                onValueChange = { ratio ->
                    val seconds = ratio * state.durationSeconds
                    webView?.evaluateJavascript("if(window.azadariSeek)azadariSeek($seconds)", null)
                    state = state.copy(currentSeconds = seconds)
                },
                modifier = Modifier.fillMaxWidth().height(24.dp)
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { webView?.evaluateJavascript("azadariSkip(-10)", null) }) {
                        Text("-10", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    IconButton(onClick = {
                        webView?.evaluateJavascript(if (state.playing) "azadariPause()" else "azadariPlay()", null)
                    }) {
                        Icon(
                            if (state.playing) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = null,
                            tint = Color.White
                        )
                    }
                    IconButton(onClick = { webView?.evaluateJavascript("azadariSkip(10)", null) }) {
                        Text("+10", color = Color.White, fontWeight = FontWeight.Bold)
                    }
                    Text(formatTime(state.currentSeconds), color = Color.White)
                    Text(" / ", color = Color.White)
                    Text(formatTime(state.durationSeconds), color = Color.White)
                }
                Row {
                    if (hasPrevious) IconButton(onClick = onPrevious) {
                        Icon(Icons.Default.SkipPrevious, contentDescription = "Previous", tint = Color.White)
                    }
                    if (hasNext) IconButton(onClick = onNext) {
                        Icon(Icons.Default.SkipNext, contentDescription = "Next", tint = Color.White)
                    }
                    IconButton(onClick = { fullscreen = !fullscreen }) {
                        Icon(
                            if (fullscreen) Icons.Default.CloseFullscreen else Icons.Default.Fullscreen,
                            contentDescription = "Fullscreen",
                            tint = Color.White
                        )
                    }
                }
            }
        }
    }
}

private fun formatTime(seconds: Float): String {
    val total = seconds.toInt().coerceAtLeast(0)
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

private fun playerHtml(videoId: String, isLive: Boolean): String =
    """
    <!doctype html><html><head>
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
    <style>html,body,#player{margin:0;padding:0;width:100%;height:100%;background:#000;overflow:hidden;border:0}</style>
    </head><body>
    <div id="player"></div>
    <script>
      var player;
      var timer;
      function emit(type,value){ AzadariPlayer.event(JSON.stringify(value)); }
      function azadariLoad(id,live){ if(player) player.loadVideoById(id); else window.pending={id:id,live:live}; }
      function azadariPlay(){player.playVideo()}
      function azadariPause(){player.pauseVideo()}
      function azadariSeek(s){player.seekTo(s,true)}
      function azadariSkip(s){var t=player.getCurrentTime()+s;player.seekTo(t,true)}
      function azadariSetSpeed(r){player.setPlaybackRate(r)}
      function azadariSetQuality(q){q==='auto'?player.setPlaybackQualityRange('highres','tiny'):player.setPlaybackQuality(q)}
      var tag=document.createElement('script');tag.src='https://www.youtube.com/iframe_api';document.head.appendChild(tag);
      function onYouTubeIframeAPIReady(){
        var cfg={id:'$videoId',live:$isLive};
        if(window.pending){cfg.id=window.pending.id;cfg.live=window.pending.live}
        player=new YT.Player('player',{
          videoId:cfg.id,
          playerVars:{playsinline:1,rel:0,modestbranding:1,controls:0,fs:0,autoplay:1},
          events:{
            onReady:function(e){emit('ready',{type:'ready'});e.target.playVideo();timer=setInterval(function(){emit('time',{type:'time',current:e.target.getCurrentTime(),duration:e.target.getDuration()})},500)},
            onStateChange:function(e){
              emit('state',{type:'state',value:e.data,ended:e.data===0});
              if(e.data===0) emit('ended',{type:'ended'});
            },
            onPlaybackQualityChange:function(e){emit('quality',{type:'quality',value:e.data})},
            onPlaybackRateChange:function(e){emit('speed',{type:'speed',value:e.data})},
            onError:function(e){emit('error',{type:'error',code:e.data})}
          }
        });
      }
    </script></body></html>
    """.trimIndent()
