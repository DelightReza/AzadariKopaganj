package com.azadari.kopaganj;

import android.content.Intent;
import android.os.Bundle;
import android.os.Build;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private OnBackInvokedCallback androidBackCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AzadariBackgroundSyncPlugin.class);
        super.onCreate(savedInstanceState);

        AzadariNotificationHelper.createNotificationChannels(this);
        ConfigSyncWorker.scheduleHourlySync(this);
        AzadariBackgroundSyncPlugin.handleRouteIntent(this, getIntent());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            androidBackCallback = this::handleAndroidBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                androidBackCallback
            );
        }
    }

    @Override
    public void onBackPressed() {
        handleAndroidBack();
    }

    private void handleAndroidBack() {
        if (bridge == null || bridge.getWebView() == null) {
            moveTaskToBack(true);
            return;
        }

        bridge.getWebView().evaluateJavascript(
            "(window.__azadariHandleAndroidBack ? window.__azadariHandleAndroidBack() : false)",
            value -> {
                boolean handled = value != null &&
                    (value.contains("true") || value.equals("1"));
                if (!handled) {
                    moveTaskToBack(true);
                }
            }
        );
    }

    @Override
    protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            androidBackCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(androidBackCallback);
        }
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        AzadariBackgroundSyncPlugin.handleRouteIntent(this, intent);
    }
}
