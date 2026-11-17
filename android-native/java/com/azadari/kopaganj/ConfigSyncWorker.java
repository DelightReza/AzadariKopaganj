package com.azadari.kopaganj;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

public class ConfigSyncWorker extends Worker {

    public static final String PREFS_NAME = "azadari_bg_sync_prefs";
    public static final String UNIQUE_WORK_NAME = "azadari_hourly_config_sync";
    public static final String UNIQUE_IMMEDIATE_WORK_NAME = "azadari_immediate_config_sync";
    public static final String RAW_BASE_URL =
        "https://raw.githubusercontent.com/DelightReza/AzadariKopaganj/main/";

    public static final String KEY_INITIALIZED = "initialized";
    public static final String KEY_ALERTS_ENABLED = "alerts_enabled";
    public static final String KEY_LAST_IS_LIVE = "last_is_live";
    public static final String KEY_LAST_LIVE_ID = "last_live_id";
    public static final String KEY_LAST_LATEST_VIDEO_ID = "last_latest_video_id";
    public static final String KEY_KNOWN_VIDEO_IDS = "known_video_ids";
    public static final String KEY_KNOWN_POST_IDS = "known_post_ids";
    public static final String KEY_LAST_SYNC_MS = "last_sync_ms";
    public static final String KEY_PENDING_ROUTE = "pending_route";

    private static final int MAX_TRACKED_IDS = 1500;
    private static final Object PREFS_LOCK = new Object();

    private static final class SimpleVideo {
        final String id;
        final String title;

        SimpleVideo(String id, String title) {
            this.id = id;
            this.title = title;
        }
    }

    private static final class SimplePost {
        final String id;
        final String title;
        final String text;

        SimplePost(String id, String title, String text) {
            this.id = id;
            this.title = title;
            this.text = text;
        }
    }

    public ConfigSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    public static void scheduleHourlySync(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();

        PeriodicWorkRequest periodicRequest = new PeriodicWorkRequest.Builder(
            ConfigSyncWorker.class,
            1,
            TimeUnit.HOURS
        )
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                PeriodicWorkRequest.MIN_BACKOFF_MILLIS,
                TimeUnit.MILLISECONDS
            )
            .build();

        WorkManager.getInstance(context.getApplicationContext()).enqueueUniquePeriodicWork(
            UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            periodicRequest
        );
    }

    public static void triggerImmediateSync(Context context) {
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();

        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(ConfigSyncWorker.class)
            .setConstraints(constraints)
            .build();

        WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(
            UNIQUE_IMMEDIATE_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        );
    }

    public static void saveBaseline(
        Context context,
        boolean isLive,
        String liveId,
        String latestVideoId,
        List<String> videoIds,
        List<String> postIds
    ) {
        synchronized (PREFS_LOCK) {
            SharedPreferences prefs = context
                .getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

            SharedPreferences.Editor editor = prefs.edit();
            editor.putBoolean(KEY_INITIALIZED, true);
            editor.putBoolean(KEY_LAST_IS_LIVE, isLive);
            editor.putString(KEY_LAST_LIVE_ID, safeString(liveId));
            editor.putString(KEY_LAST_LATEST_VIDEO_ID, safeString(latestVideoId));
            editor.putString(KEY_KNOWN_VIDEO_IDS, encodeIdList(videoIds));
            editor.putString(KEY_KNOWN_POST_IDS, encodeIdList(postIds));
            editor.putLong(KEY_LAST_SYNC_MS, System.currentTimeMillis());
            editor.apply();
        }
    }

    public static void setAlertsEnabled(Context context, boolean enabled) {
        synchronized (PREFS_LOCK) {
            SharedPreferences prefs = context
                .getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putBoolean(KEY_ALERTS_ENABLED, enabled).apply();
        }
    }

    public static boolean isAlertsEnabled(Context context) {
        SharedPreferences prefs = context
            .getApplicationContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(KEY_ALERTS_ENABLED, true);
    }

    public static void savePendingRoute(Context context, String route) {
        if (route == null || route.trim().isEmpty()) {
            return;
        }
        SharedPreferences prefs = context
            .getApplicationContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_PENDING_ROUTE, route.trim()).apply();
    }

    public static String consumePendingRoute(Context context) {
        SharedPreferences prefs = context
            .getApplicationContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String route = prefs.getString(KEY_PENDING_ROUTE, null);
        if (route != null) {
            prefs.edit().remove(KEY_PENDING_ROUTE).apply();
        }
        return route;
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        AzadariNotificationHelper.createNotificationChannels(context);

        long cacheBust = System.currentTimeMillis() / 1000L;
        String configRaw = fetchText(RAW_BASE_URL + "config.json?cb=" + cacheBust);
        if (configRaw == null || configRaw.isEmpty()) {
            return Result.retry();
        }

        try {
            JSONObject configJson = new JSONObject(configRaw);

            boolean configIsLive = configJson.optBoolean("is_live", false);
            String configLatestVideoId = safeString(configJson.optString("latest_video_id", ""));
            String configLatestVideoTitle = safeString(configJson.optString("latest_video_title", ""));

            String livePath = "assets/livenow.json";
            JSONObject endpoints = configJson.optJSONObject("endpoints");
            if (endpoints != null) {
                String epLive = safeString(endpoints.optString("live", ""));
                if (!epLive.isEmpty()) {
                    livePath = normalizeRelativePath(epLive);
                }
            }

            boolean liveNowFlag = false;
            String liveNowId = "";
            String liveNowTitle = "";
            String liveRaw = fetchText(RAW_BASE_URL + livePath + "?cb=" + cacheBust);
            if (liveRaw != null && !liveRaw.isEmpty()) {
                JSONObject liveJson = new JSONObject(liveRaw);
                liveNowFlag = liveJson.optBoolean("is_live", false);
                liveNowId = safeString(liveJson.optString("youtube_id", ""));
                liveNowTitle = safeString(liveJson.optString("title", ""));
            }

            boolean effectiveIsLive = liveNowFlag || configIsLive;
            String effectiveLiveId = !liveNowId.isEmpty()
                ? liveNowId
                : (configIsLive ? configLatestVideoId : "");
            String effectiveLiveTitle = !liveNowTitle.isEmpty()
                ? liveNowTitle
                : (configIsLive ? configLatestVideoTitle : "");

            // Discover newest 2 months of videos.json & post.json to catch fresh uploads across month rollovers
            List<String> videoPaths = new ArrayList<>();
            List<String> postPaths = new ArrayList<>();

            JSONArray months = configJson.optJSONArray("available_months");
            if (months != null) {
                int monthLimit = Math.min(2, months.length());
                for (int i = 0; i < monthLimit; i++) {
                    JSONObject m = months.optJSONObject(i);
                    if (m == null) continue;
                    String vp = normalizeRelativePath(m.optString("videos_path", ""));
                    String pp = normalizeRelativePath(m.optString("post_path", ""));
                    if (!vp.isEmpty() && !videoPaths.contains(vp)) {
                        videoPaths.add(vp);
                    }
                    if (!pp.isEmpty() && !postPaths.contains(pp)) {
                        postPaths.add(pp);
                    }
                }
            }

            if (videoPaths.isEmpty()) {
                JSONArray vFiles = configJson.optJSONArray("video_json_files");
                if (vFiles != null && vFiles.length() > 0) {
                    String vp = normalizeRelativePath(vFiles.optString(0, ""));
                    if (!vp.isEmpty()) videoPaths.add(vp);
                }
            }
            if (postPaths.isEmpty()) {
                JSONArray pFiles = configJson.optJSONArray("post_json_files");
                if (pFiles != null && pFiles.length() > 0) {
                    String pp = normalizeRelativePath(pFiles.optString(0, ""));
                    if (!pp.isEmpty()) postPaths.add(pp);
                }
            }

            List<SimpleVideo> recentVideos = new ArrayList<>();
            Set<String> seenFetchedVideos = new HashSet<>();
            for (String vp : videoPaths) {
                String vRaw = fetchText(RAW_BASE_URL + vp + "?cb=" + cacheBust);
                if (vRaw == null || vRaw.isEmpty()) continue;
                JSONArray arr = new JSONArray(vRaw);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.optJSONObject(i);
                    if (obj == null) continue;
                    String vid = safeString(obj.optString("youtube_id", ""));
                    if (vid.isEmpty()) {
                        vid = safeString(obj.optString("id", ""));
                    }
                    String title = safeString(obj.optString("title", "Azadari Kopaganj Video"));
                    if (!vid.isEmpty() && seenFetchedVideos.add(vid)) {
                        recentVideos.add(new SimpleVideo(vid, title));
                    }
                }
            }

            List<SimplePost> recentPosts = new ArrayList<>();
            Set<String> seenFetchedPosts = new HashSet<>();
            for (String pp : postPaths) {
                String pRaw = fetchText(RAW_BASE_URL + pp + "?cb=" + cacheBust);
                if (pRaw == null || pRaw.isEmpty()) continue;
                JSONArray arr = new JSONArray(pRaw);
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject obj = arr.optJSONObject(i);
                    if (obj == null) continue;
                    String pid = safeString(obj.optString("id", ""));
                    String title = safeString(obj.optString("title", "Community Update"));
                    String text = safeString(obj.optString("text", title));
                    if (!pid.isEmpty() && seenFetchedPosts.add(pid)) {
                        recentPosts.add(new SimplePost(pid, title, text));
                    }
                }
            }

            synchronized (PREFS_LOCK) {
                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                boolean initialized = prefs.getBoolean(KEY_INITIALIZED, false);
                boolean alertsEnabled = prefs.getBoolean(KEY_ALERTS_ENABLED, true);
                boolean prevIsLive = prefs.getBoolean(KEY_LAST_IS_LIVE, false);
                String prevLiveId = safeString(prefs.getString(KEY_LAST_LIVE_ID, ""));
                String prevLatestVideoId = safeString(prefs.getString(KEY_LAST_LATEST_VIDEO_ID, ""));

                List<String> prevVideoIds = decodeIdList(prefs.getString(KEY_KNOWN_VIDEO_IDS, "[]"));
                List<String> prevPostIds = decodeIdList(prefs.getString(KEY_KNOWN_POST_IDS, "[]"));
                Set<String> prevVideoSet = new HashSet<>(prevVideoIds);
                Set<String> prevPostSet = new HashSet<>(prevPostIds);

                boolean canNotify = alertsEnabled && AzadariNotificationHelper.canPostNotifications(context);

                if (!initialized) {
                    // Cold install before UI first opened: only alert if currently live
                    if (canNotify && effectiveIsLive) {
                        String liveBody = !effectiveLiveTitle.isEmpty()
                            ? effectiveLiveTitle
                            : "Live Majlis / Broadcast is streaming now.";
                        AzadariNotificationHelper.showNotification(
                            context,
                            AzadariNotificationHelper.CHANNEL_LIVE,
                            notificationIdFor("live_" + effectiveLiveId),
                            "Live Now: Azadari Kopaganj",
                            liveBody,
                            "#/watch/live?from=live"
                        );
                    }
                } else if (canNotify) {
                    boolean emittedLiveAlert = false;
                    if (
                        effectiveIsLive &&
                        (!prevIsLive || (!effectiveLiveId.isEmpty() && !effectiveLiveId.equals(prevLiveId)))
                    ) {
                        emittedLiveAlert = true;
                        String liveBody = !effectiveLiveTitle.isEmpty()
                            ? effectiveLiveTitle
                            : "Live Majlis / Julus broadcast has started.";
                        AzadariNotificationHelper.showNotification(
                            context,
                            AzadariNotificationHelper.CHANNEL_LIVE,
                            notificationIdFor("live_" + effectiveLiveId),
                            "Live Now: Azadari Kopaganj",
                            liveBody,
                            "#/watch/live?from=live"
                        );
                    }

                    List<SimpleVideo> newVideos = new ArrayList<>();
                    for (SimpleVideo v : recentVideos) {
                        if (!prevVideoSet.contains(v.id)) {
                            if (emittedLiveAlert && v.id.equals(effectiveLiveId)) {
                                continue;
                            }
                            newVideos.add(v);
                        }
                    }

                    if (
                        !configLatestVideoId.isEmpty() &&
                        !configLatestVideoId.equals(prevLatestVideoId) &&
                        !prevVideoSet.contains(configLatestVideoId)
                    ) {
                        boolean alreadyListed = emittedLiveAlert && configLatestVideoId.equals(effectiveLiveId);
                        for (SimpleVideo v : newVideos) {
                            if (v.id.equals(configLatestVideoId)) {
                                alreadyListed = true;
                                break;
                            }
                        }
                        if (!alreadyListed) {
                            String fallbackTitle = !configLatestVideoTitle.isEmpty()
                                ? configLatestVideoTitle
                                : "New upload available on Azadari Kopaganj.";
                            newVideos.add(0, new SimpleVideo(configLatestVideoId, fallbackTitle));
                        }
                    }

                    if (!newVideos.isEmpty()) {
                        if (newVideos.size() <= 3) {
                            for (SimpleVideo nv : newVideos) {
                                AzadariNotificationHelper.showNotification(
                                    context,
                                    AzadariNotificationHelper.CHANNEL_VIDEO,
                                    notificationIdFor("video_" + nv.id),
                                    "New Video — Azadari Kopaganj",
                                    nv.title,
                                    "#/watch/" + nv.id + "?from=videos"
                                );
                            }
                        } else {
                            AzadariNotificationHelper.showNotification(
                                context,
                                AzadariNotificationHelper.CHANNEL_VIDEO,
                                notificationIdFor("videos_batch_" + newVideos.get(0).id),
                                newVideos.size() + " New Videos — Azadari Kopaganj",
                                newVideos.get(0).title + " and more uploads available.",
                                "#/videos"
                            );
                        }
                    }

                    List<SimplePost> newPosts = new ArrayList<>();
                    for (SimplePost p : recentPosts) {
                        if (!prevPostSet.contains(p.id)) {
                            newPosts.add(p);
                        }
                    }

                    if (!newPosts.isEmpty()) {
                        if (newPosts.size() <= 3) {
                            for (SimplePost np : newPosts) {
                                AzadariNotificationHelper.showNotification(
                                    context,
                                    AzadariNotificationHelper.CHANNEL_POST,
                                    notificationIdFor("post_" + np.id),
                                    "New Post: " + np.title,
                                    np.text,
                                    "#/posts"
                                );
                            }
                        } else {
                            AzadariNotificationHelper.showNotification(
                                context,
                                AzadariNotificationHelper.CHANNEL_POST,
                                notificationIdFor("posts_batch_" + newPosts.get(0).id),
                                newPosts.size() + " New Community Posts",
                                newPosts.get(0).title,
                                "#/posts"
                            );
                        }
                    }
                }

                // Merge newly fetched IDs ahead of previously known IDs cleanly
                LinkedHashSet<String> mergedVideos = new LinkedHashSet<>();
                if (!configLatestVideoId.isEmpty()) mergedVideos.add(configLatestVideoId);
                for (SimpleVideo v : recentVideos) mergedVideos.add(v.id);
                mergedVideos.addAll(prevVideoIds);

                LinkedHashSet<String> mergedPosts = new LinkedHashSet<>();
                for (SimplePost p : recentPosts) mergedPosts.add(p.id);
                mergedPosts.addAll(prevPostIds);

                SharedPreferences.Editor editor = prefs.edit();
                editor.putBoolean(KEY_INITIALIZED, true);
                editor.putBoolean(KEY_LAST_IS_LIVE, effectiveIsLive);
                editor.putString(KEY_LAST_LIVE_ID, effectiveLiveId);
                editor.putString(KEY_LAST_LATEST_VIDEO_ID, configLatestVideoId);
                editor.putString(KEY_KNOWN_VIDEO_IDS, encodeIdList(new ArrayList<>(mergedVideos)));
                editor.putString(KEY_KNOWN_POST_IDS, encodeIdList(new ArrayList<>(mergedPosts)));
                editor.putLong(KEY_LAST_SYNC_MS, System.currentTimeMillis());
                editor.apply();
            }

            return Result.success();
        } catch (Exception exc) {
            return Result.retry();
        }
    }

    private static String fetchText(String urlStr) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setUseCaches(false);
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Cache-Control", "no-cache, no-store");
            conn.setRequestProperty("Pragma", "no-cache");
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) {
                return null;
            }
            StringBuilder sb = new StringBuilder();
            try (
                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
                )
            ) {
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line).append('\n');
                }
            }
            return sb.toString();
        } catch (Exception exc) {
            return null;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private static String normalizeRelativePath(String path) {
        String s = safeString(path);
        while (s.startsWith("./")) {
            s = s.substring(2);
        }
        while (s.startsWith("/")) {
            s = s.substring(1);
        }
        return s;
    }

    private static String safeString(String value) {
        return value == null ? "" : value.trim();
    }

    private static int notificationIdFor(String key) {
        int hash = key == null ? 1 : key.hashCode();
        return Math.abs(hash == Integer.MIN_VALUE ? 1001 : hash);
    }

    private static String encodeIdList(List<String> ids) {
        JSONArray arr = new JSONArray();
        if (ids != null) {
            int count = 0;
            HashSet<String> seen = new HashSet<>();
            for (String id : ids) {
                if (id == null) continue;
                String clean = id.trim();
                if (!clean.isEmpty() && seen.add(clean)) {
                    arr.put(clean);
                    count++;
                    if (count >= MAX_TRACKED_IDS) break;
                }
            }
        }
        return arr.toString();
    }

    private static List<String> decodeIdList(String json) {
        List<String> out = new ArrayList<>();
        if (json == null || json.isEmpty()) {
            return out;
        }
        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                String val = safeString(arr.optString(i, ""));
                if (!val.isEmpty()) {
                    out.add(val);
                }
            }
        } catch (Exception ignored) {
            // ignore corrupted snapshot
        }
        return out;
    }
}
