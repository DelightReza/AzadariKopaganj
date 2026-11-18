package com.azadari.kopaganj

import android.os.Bundle
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.azadari.kopaganj.ui.AzadariApp
import com.azadari.kopaganj.ui.theme.AzadariTheme
import com.azadari.kopaganj.notifications.AzadariNotifications
import com.azadari.kopaganj.workers.ConfigSyncWorker

class MainActivity : ComponentActivity() {
    companion object {
        @Volatile
        var pendingRoute: String? = null
        fun consumePendingRoute(): String? = pendingRoute.also { pendingRoute = null }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        AzadariNotifications.createChannels(this)
        ConfigSyncWorker.schedule(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
        }
        pendingRoute = intent?.getStringExtra(AzadariNotifications.EXTRA_ROUTE)
        setContent {
            AzadariTheme {
                AzadariApp()
            }
        }

        override fun onNewIntent(intent: android.content.Intent) {
            super.onNewIntent(intent)
            pendingRoute = intent.getStringExtra(AzadariNotifications.EXTRA_ROUTE)
        }
    }
}
