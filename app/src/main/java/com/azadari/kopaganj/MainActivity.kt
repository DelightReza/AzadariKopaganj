package com.azadari.kopaganj

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.azadari.kopaganj.ui.AzadariApp
import com.azadari.kopaganj.ui.theme.AzadariTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AzadariTheme {
                AzadariApp()
            }
        }
    }
}
