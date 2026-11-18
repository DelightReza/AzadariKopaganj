package com.azadari.kopaganj

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

object AzadariNotificationHelper {
    const val CHANNEL_LIVE = "azadari_live_alerts"
    const val CHANNEL_VIDEO = "azadari_video_alerts"
    const val CHANNEL_POST = "azadari_post_alerts"
    const val EXTRA_ROUTE = "azadari_route"

    fun createNotificationChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        val liveChannel = NotificationChannel(
            CHANNEL_LIVE,
            "Live Broadcasts",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Instant alerts when Azadari Kopaganj goes Live"
            enableLights(true)
            lightColor = Color.RED
            enableVibration(true)
        }
        manager.createNotificationChannel(liveChannel)

        val videoChannel = NotificationChannel(
            CHANNEL_VIDEO,
            "New Videos",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Alerts when new Majlis, Nauha, Jashn, or Qaseeda videos are uploaded"
            enableVibration(true)
        }
        manager.createNotificationChannel(videoChannel)

        val postChannel = NotificationChannel(
            CHANNEL_POST,
            "Community Posts",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Alerts when new community notices and announcements are posted"
        }
        manager.createNotificationChannel(postChannel)
    }

    fun canPostNotifications(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) return false
        return NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    fun showNotification(
        context: Context,
        channelId: String,
        notificationId: Int,
        title: String?,
        body: String?,
        routeHash: String?
    ) {
        if (!canPostNotifications(context)) return
        createNotificationChannels(context)

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (!routeHash.isNullOrEmpty()) putExtra(EXTRA_ROUTE, routeHash)
        }
        var pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pendingFlags = pendingFlags or PendingIntent.FLAG_IMMUTABLE
        val contentIntent = PendingIntent.getActivity(context, notificationId, intent, pendingFlags)

        val safeTitle = title?.trim()?.takeIf { it.isNotEmpty() } ?: "Azadari Kopaganj"
        val safeBody = body?.trim()?.takeIf { it.isNotEmpty() } ?: "New update available."
        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_azadari)
            .setColor(0xFFFF0000.toInt())
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setStyle(NotificationCompat.BigTextStyle().bigText(safeBody))
            .setPriority(if (channelId == CHANNEL_LIVE) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)

        if (channelId == CHANNEL_LIVE) builder.setCategory(NotificationCompat.CATEGORY_EVENT)
        try {
            NotificationManagerCompat.from(context).notify(notificationId, builder.build())
        } catch (_: SecurityException) {
            // Permission may be revoked concurrently.
        }
    }
}
