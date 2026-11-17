package com.azadari.kopaganj;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AzadariBackgroundSyncPlugin.class);
        super.onCreate(savedInstanceState);

        AzadariNotificationHelper.createNotificationChannels(this);
        ConfigSyncWorker.scheduleHourlySync(this);
        AzadariBackgroundSyncPlugin.handleRouteIntent(this, getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        AzadariBackgroundSyncPlugin.handleRouteIntent(this, intent);
    }
}
