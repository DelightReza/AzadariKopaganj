package com.azadari.kopaganj.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.azadari.kopaganj.MainActivity
import com.azadari.kopaganj.R

object AzadariNotifications {
    const val LIVE = "azadari_live"
    const val VIDEO = "azadari_video"
    const val POST = "azadari_post"
    const val EXTRA_ROUTE = "azadari_route"

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel(LIVE, "Live Broadcasts", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Live Azadari broadcasts"
            })
            manager.createNotificationChannel(NotificationChannel(VIDEO, "New Videos", NotificationManager.IMPORTANCE_DEFAULT))
            manager.createNotificationChannel(NotificationChannel(POST, "Community Posts", NotificationManager.IMPORTANCE_DEFAULT))
        }
    }

    fun show(context: Context, channel: String, id: Int, title: String, body: String, route: String) {
        createChannels(context)
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_ROUTE, route)
        }
        val pending = PendingIntent.getActivity(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, channel)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(id, notification)
    }
}
