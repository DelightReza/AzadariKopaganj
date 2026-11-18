package com.azadari.kopaganj

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    private var androidBackCallback: OnBackInvokedCallback? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(AzadariBackgroundSyncPlugin::class.java)
        super.onCreate(savedInstanceState)

        AzadariNotificationHelper.createNotificationChannels(this)
        ConfigSyncWorker.scheduleHourlySync(this)
        AzadariBackgroundSyncPlugin.handleRouteIntent(this, intent)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            androidBackCallback = OnBackInvokedCallback { handleAndroidBack() }
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                androidBackCallback!!
            )
        }
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        handleAndroidBack()
    }

    private fun handleAndroidBack() {
        val webView = bridge?.webView
        if (webView == null) {
            moveTaskToBack(true)
            return
        }

        webView.evaluateJavascript(
            "(window.__azadariHandleAndroidBack ? window.__azadariHandleAndroidBack() : false)"
        ) { value ->
            val handled = value != null && (value.contains("true") || value == "1")
            if (!handled) moveTaskToBack(true)
        }
    }

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            androidBackCallback?.let { onBackInvokedDispatcher.unregisterOnBackInvokedCallback(it) }
        }
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        AzadariBackgroundSyncPlugin.handleRouteIntent(this, intent)
    }
}
