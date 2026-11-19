package com.azadari.kopaganj;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "AzadariBackgroundSync")
public class AzadariBackgroundSyncPlugin extends Plugin {

    private static WeakReference<AzadariBackgroundSyncPlugin> activePluginRef = new WeakReference<>(null);

    @Override
    public void load() {
        super.load();
        activePluginRef = new WeakReference<>(this);
    }

    @Override
    protected void handleOnDestroy() {
        AzadariBackgroundSyncPlugin current = activePluginRef.get();
        if (current == this) {
            activePluginRef.clear();
        }
        super.handleOnDestroy();
    }

    public static void handleRouteIntent(Context context, Intent intent) {
        if (intent == null) {
            return;
        }
        String route = intent.getStringExtra(AzadariNotificationHelper.EXTRA_ROUTE);
        if (route == null || route.trim().isEmpty()) {
            return;
        }
        String cleanRoute = route.trim();
        intent.removeExtra(AzadariNotificationHelper.EXTRA_ROUTE);

        AzadariBackgroundSyncPlugin plugin = activePluginRef.get();
        if (plugin != null && plugin.getBridge() != null) {
            JSObject payload = new JSObject();
            payload.put("route", cleanRoute);
            plugin.notifyListeners("notificationRoute", payload, true);
        } else {
            ConfigSyncWorker.savePendingRoute(context, cleanRoute);
        }
    }

    @PluginMethod
    public void ensureScheduled(PluginCall call) {
        Context context = getContext();
        AzadariNotificationHelper.createNotificationChannels(context);
        ConfigSyncWorker.scheduleHourlySync(context);

        JSObject ret = new JSObject();
        ret.put("scheduled", true);
        ret.put("intervalMinutes", 60);
        ret.put("notificationsEnabled", AzadariNotificationHelper.canPostNotifications(context));
        ret.put("alertsEnabled", ConfigSyncWorker.isAlertsEnabled(context));
        call.resolve(ret);
    }

    @PluginMethod
    public void checkNotificationStatus(PluginCall call) {
        Context context = getContext();
        JSObject ret = new JSObject();
        ret.put("allowed", AzadariNotificationHelper.canPostNotifications(context));
        ret.put("alertsEnabled", ConfigSyncWorker.isAlertsEnabled(context));
        call.resolve(ret);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context context = getContext();
        Activity activity = getActivity();
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
            } else {
                intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.fromParts("package", context.getPackageName(), null));
            }
            if (activity != null) {
                activity.startActivity(intent);
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            }
            JSObject ret = new JSObject();
            ret.put("opened", true);
            call.resolve(ret);
        } catch (Exception exc) {
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(Uri.fromParts("package", context.getPackageName(), null));
                if (activity != null) {
                    activity.startActivity(fallback);
                } else {
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(fallback);
                }
                JSObject ret = new JSObject();
                ret.put("opened", true);
                call.resolve(ret);
            } catch (Exception ignored) {
                JSObject ret = new JSObject();
                ret.put("opened", false);
                call.resolve(ret);
            }
        }
    }

    @PluginMethod
    public void syncBaseline(PluginCall call) {
        Context context = getContext();
        boolean isLive = Boolean.TRUE.equals(call.getBoolean("isLive", false));
        String liveVideoId = call.getString("liveVideoId", "");
        String latestVideoId = call.getString("latestVideoId", "");

        List<String> videoIds = extractStringList(call.getArray("knownVideoIds"));
        List<String> postIds = extractStringList(call.getArray("knownPostIds"));

        ConfigSyncWorker.saveBaseline(context, isLive, liveVideoId, latestVideoId, videoIds, postIds);

        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void setAlertsEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        ConfigSyncWorker.setAlertsEnabled(getContext(), enabled);

        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void triggerImmediateCheck(PluginCall call) {
        ConfigSyncWorker.triggerImmediateSync(getContext());
        JSObject ret = new JSObject();
        ret.put("queued", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void consumePendingRoute(PluginCall call) {
        String route = ConfigSyncWorker.consumePendingRoute(getContext());
        JSObject ret = new JSObject();
        ret.put("route", route);
        call.resolve(ret);
    }

    @PluginMethod
    public void setFullscreenMode(PluginCall call) {
        boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        String orientation = call.getString("orientation", "unlocked");
        Activity activity = getActivity();
        boolean ok = MainActivity.applyFullscreenMode(activity, active, orientation);
        JSObject ret = new JSObject();
        ret.put("ok", ok);
        call.resolve(ret);
    }

    private static List<String> extractStringList(JSArray array) {
        List<String> result = new ArrayList<>();
        if (array == null) {
            return result;
        }
        for (int i = 0; i < array.length(); i++) {
            try {
                String value = array.getString(i);
                if (value != null && !value.trim().isEmpty()) {
                    result.add(value.trim());
                }
            } catch (Exception ignored) {
                // ignore malformed entry
            }
        }
        return result;
    }
}
