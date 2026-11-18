package com.azadari.kopaganj.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColors = lightColorScheme(
    primary = Color(0xFF8C1D18),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFFFDAD5),
    secondary = Color(0xFF775651),
    tertiary = Color(0xFF705C2E),
    background = Color(0xFFFFFBFF),
    surface = Color(0xFFFFFBFF)
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFFFB4A8),
    onPrimary = Color(0xFF680003),
    primaryContainer = Color(0xFF930F09),
    secondary = Color(0xFFE7BDB6),
    tertiary = Color(0xFFDDBF88),
    background = Color(0xFF1C1B1A),
    surface = Color(0xFF1C1B1A)
)

@Composable
fun AzadariTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content
    )
}
