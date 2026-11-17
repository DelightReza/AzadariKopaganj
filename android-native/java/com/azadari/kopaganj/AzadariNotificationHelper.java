package com.azadari.kopaganj;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

public final class AzadariNotificationHelper {

    public static final String CHANNEL_LIVE = "azadari_live_alerts";
    public static final String CHANNEL_VIDEO = "azadari_video_alerts";
    public static final String CHANNEL_POST = "azadari_post_alerts";
    public static final String EXTRA_ROUTE = "azadari_route";

    private AzadariNotificationHelper() {}

    public static void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        NotificationChannel liveChannel = new NotificationChannel(
            CHANNEL_LIVE,
            "Live Broadcasts",
            NotificationManager.IMPORTANCE_HIGH
        );
        liveChannel.setDescription("Instant alerts when Azadari Kopaganj goes Live");
        liveChannel.enableLights(true);
        liveChannel.setLightColor(Color.RED);
        liveChannel.enableVibration(true);
        manager.createNotificationChannel(liveChannel);

        NotificationChannel videoChannel = new NotificationChannel(
            CHANNEL_VIDEO,
            "New Videos",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        videoChannel.setDescription("Alerts when new Majlis, Nauha, Jashn, or Qaseeda videos are uploaded");
        videoChannel.enableVibration(true);
        manager.createNotificationChannel(videoChannel);

        NotificationChannel postChannel = new NotificationChannel(
            CHANNEL_POST,
            "Community Posts",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        postChannel.setDescription("Alerts when new community notices and announcements are posted");
        manager.createNotificationChannel(postChannel);
    }

    public static boolean canPostNotifications(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            int granted = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS);
            if (granted != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    public static void showNotification(
        Context context,
        String channelId,
        int notificationId,
        String title,
        String body,
        String routeHash
    ) {
        if (!canPostNotifications(context)) {
            return;
        }
        createNotificationChannels(context);

        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (routeHash != null && !routeHash.isEmpty()) {
            intent.putExtra(EXTRA_ROUTE, routeHash);
        }

        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            pendingFlags
        );

        String safeTitle = (title != null && !title.trim().isEmpty()) ? title.trim() : "Azadari Kopaganj";
        String safeBody = (body != null && !body.trim().isEmpty()) ? body.trim() : "New update available.";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_stat_azadari)
            .setColor(0xFFFF0000)
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(safeBody))
            .setPriority(
                CHANNEL_LIVE.equals(channelId)
                    ? NotificationCompat.PRIORITY_HIGH
                    : NotificationCompat.PRIORITY_DEFAULT
            )
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setContentIntent(contentIntent);

        if (CHANNEL_LIVE.equals(channelId)) {
            builder.setCategory(NotificationCompat.CATEGORY_EVENT);
        }

        try {
            NotificationManagerCompat.from(context).notify(notificationId, builder.build());
        } catch (SecurityException ignored) {
            // Permission revoked concurrently
        }
    }
}
