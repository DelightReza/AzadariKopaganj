package com.azadari.kopaganj;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private OnBackInvokedCallback androidBackCallback;

    private static final class AndroidFullscreenBridge {
        private final Activity activity;

        AndroidFullscreenBridge(Activity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public boolean setFullscreenMode(boolean active, String orientation) {
            return MainActivity.applyFullscreenMode(activity, active, orientation);
        }
    }

    @SuppressWarnings("deprecation")
    public static boolean applyFullscreenMode(Activity activity, boolean active, String orientation) {
        if (activity == null || activity.isFinishing()) {
            return false;
        }
        final String mode = orientation == null ? "unlocked" : orientation.trim();
        activity.runOnUiThread(() -> {
            // 1. Force Activity orientation first in an isolated block so insets/cutout never block rotation
            try {
                if (!active || "unlocked".equalsIgnoreCase(mode)) {
                    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                } else if ("portrait".equalsIgnoreCase(mode)) {
                    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                } else {
                    // SCREEN_ORIENTATION_LANDSCAPE forces landscape immediately even when Auto-Rotate is OFF
                    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
                }
            } catch (Exception ignored) {
                // ignore orientation lock exceptions on restricted multi-window devices
            }

            // 2. Toggle immersive fullscreen system bars, short-edge cutout, and keep-screen-on
            try {
                Window window = activity.getWindow();
                if (window != null) {
                    View decorView = window.getDecorView();
                    WindowInsetsControllerCompat controller =
                        WindowCompat.getInsetsController(window, decorView);

                    if (active) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            WindowManager.LayoutParams lp = window.getAttributes();
                            lp.layoutInDisplayCutoutMode =
                                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                            window.setAttributes(lp);
                        }
                        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        if (controller != null) {
                            controller.setSystemBarsBehavior(
                                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                            );
                            controller.hide(WindowInsetsCompat.Type.systemBars());
                        }
                        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                            decorView.setSystemUiVisibility(
                                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            );
                        }
                    } else {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                            WindowManager.LayoutParams lp = window.getAttributes();
                            lp.layoutInDisplayCutoutMode =
                                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
                            window.setAttributes(lp);
                        }
                        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                        if (controller != null) {
                            controller.show(WindowInsetsCompat.Type.systemBars());
                        }
                        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                            decorView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
                        }
                    }
                }
            } catch (Exception ignored) {
                // ignore system bar exceptions
            }
        });
        return true;
    }

    @Override
    protected void load() {
        WebView wv = findViewById(com.getcapacitor.android.R.id.webview);
        if (wv != null) {
            wv.addJavascriptInterface(
                new AndroidFullscreenBridge(this),
                "AzadariAndroidBridge"
            );
        }
        super.load();
    }

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
    public void onDestroy() {
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
