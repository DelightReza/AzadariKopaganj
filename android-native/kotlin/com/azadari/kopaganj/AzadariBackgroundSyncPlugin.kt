package com.azadari.kopaganj

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.lang.ref.WeakReference

@CapacitorPlugin(name = "AzadariBackgroundSync")
class AzadariBackgroundSyncPlugin : Plugin() {
    override fun load() {
        super.load()
        activePluginRef = WeakReference(this)
    }

    override fun handleOnDestroy() {
        if (activePluginRef.get() === this) activePluginRef.clear()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun ensureScheduled(call: PluginCall) {
        val context = context
        AzadariNotificationHelper.createNotificationChannels(context)
        ConfigSyncWorker.scheduleHourlySync(context)
        call.resolve(JSObject().apply {
            put("scheduled", true)
            put("intervalMinutes", 60)
            put("notificationsEnabled", AzadariNotificationHelper.canPostNotifications(context))
            put("alertsEnabled", ConfigSyncWorker.isAlertsEnabled(context))
        })
    }

    @PluginMethod
    fun checkNotificationStatus(call: PluginCall) {
        val context = context
        call.resolve(JSObject().apply {
            put("allowed", AzadariNotificationHelper.canPostNotifications(context))
            put("alertsEnabled", ConfigSyncWorker.isAlertsEnabled(context))
        })
    }

    @PluginMethod
    fun openNotificationSettings(call: PluginCall) {
        val context = context
        val activity = activity
        try {
            val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(
                    Settings.EXTRA_APP_PACKAGE, context.packageName
                )
            } else {
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(
                    Uri.fromParts("package", context.packageName, null)
                )
            }
            launchSettings(context, activity, intent)
            call.resolve(JSObject().put("opened", true))
        } catch (_: Exception) {
            try {
                val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(
                    Uri.fromParts("package", context.packageName, null)
                )
                launchSettings(context, activity, fallback)
                call.resolve(JSObject().put("opened", true))
            } catch (_: Exception) {
                call.resolve(JSObject().put("opened", false))
            }
        }
    }

    @PluginMethod
    fun syncBaseline(call: PluginCall) {
        ConfigSyncWorker.saveBaseline(
            context,
            call.getBoolean("isLive", false) == true,
            call.getString("liveVideoId", ""),
            call.getString("latestVideoId", ""),
            extractStringList(call.getArray("knownVideoIds")),
            extractStringList(call.getArray("knownPostIds"))
        )
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun setAlertsEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) == true
        ConfigSyncWorker.setAlertsEnabled(context, enabled)
        call.resolve(JSObject().put("enabled", enabled))
    }

    @PluginMethod
    fun triggerImmediateCheck(call: PluginCall) {
        ConfigSyncWorker.triggerImmediateSync(context)
        call.resolve(JSObject().put("queued", true))
    }

    @PluginMethod
    fun consumePendingRoute(call: PluginCall) {
        call.resolve(JSObject().put("route", ConfigSyncWorker.consumePendingRoute(context)))
    }

    private fun launchSettings(context: Context, activity: Activity?, intent: Intent) {
        if (activity != null) activity.startActivity(intent)
        else context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    companion object {
        private var activePluginRef = WeakReference<AzadariBackgroundSyncPlugin>(null)

        @JvmStatic
        fun handleRouteIntent(context: Context, intent: Intent?) {
            val route = intent?.getStringExtra(AzadariNotificationHelper.EXTRA_ROUTE)?.trim()
            if (route.isNullOrEmpty()) return
            intent.removeExtra(AzadariNotificationHelper.EXTRA_ROUTE)
            val plugin = activePluginRef.get()
            if (plugin?.bridge != null) {
                plugin.notifyListeners("notificationRoute", JSObject().put("route", route), true)
            } else {
                ConfigSyncWorker.savePendingRoute(context, route)
            }
        }

        private fun extractStringList(array: JSArray?): List<String> {
            if (array == null) return emptyList()
            return buildList {
                for (i in 0 until array.length()) {
                    try {
                        array.getString(i)?.trim()?.takeIf { it.isNotEmpty() }?.let(::add)
                    } catch (_: Exception) {
                        // Ignore malformed entries.
                    }
                }
            }
        }
    }
}
