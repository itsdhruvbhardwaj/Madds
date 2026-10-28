package com.itsdhruvbhardwaj.picme.ui.theme

import android.app.Activity
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val MaddsDarkColorScheme = darkColorScheme(
    primary = MaddsPalette.gold,
    onPrimary = MaddsPalette.goldOn,
    primaryContainer = Color(0xFF3B301B),
    onPrimaryContainer = MaddsPalette.goldSoft,
    secondary = MaddsPalette.goldSoft,
    onSecondary = MaddsPalette.goldOn,
    secondaryContainer = MaddsPalette.darkElevated,
    onSecondaryContainer = MaddsPalette.darkText,
    background = MaddsPalette.darkBackground,
    onBackground = MaddsPalette.darkText,
    surface = MaddsPalette.darkSurface,
    onSurface = MaddsPalette.darkText,
    surfaceVariant = MaddsPalette.darkElevated,
    onSurfaceVariant = MaddsPalette.darkMutedText,
    outline = MaddsPalette.darkOutline,
    error = MaddsPalette.error,
    onError = Color(0xFF2A1111)
)

private val MaddsLightColorScheme = lightColorScheme(
    primary = Color(0xFF987126),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFF4E5C2),
    onPrimaryContainer = Color(0xFF33250B),
    secondary = Color(0xFF80601F),
    onSecondary = Color.White,
    secondaryContainer = MaddsPalette.lightElevated,
    onSecondaryContainer = MaddsPalette.lightText,
    background = MaddsPalette.lightBackground,
    onBackground = MaddsPalette.lightText,
    surface = MaddsPalette.lightSurface,
    onSurface = MaddsPalette.lightText,
    surfaceVariant = MaddsPalette.lightElevated,
    onSurfaceVariant = MaddsPalette.lightMutedText,
    outline = MaddsPalette.lightOutline,
    error = Color(0xFFBA1A1A),
    onError = Color.White
)

@Composable
fun MaddsTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) MaddsDarkColorScheme else MaddsLightColorScheme
    val view = LocalView.current

    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            window.navigationBarColor = colorScheme.background.toArgb()
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !darkTheme
            controller.isAppearanceLightNavigationBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        shapes = Shapes,
        content = content
    )
}

@Deprecated("Use MaddsTheme", ReplaceWith("MaddsTheme(darkTheme, content)"))
@Composable
fun PicMeTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit
) = MaddsTheme(darkTheme, content)
