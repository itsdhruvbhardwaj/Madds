package com.itsdhruvbhardwaj.picme.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/** Madds palette tokens. Keep palette changes here to make future theme variants straightforward. */
object MaddsPalette {
    val darkBackground = Color(0xFF111213)
    val darkSurface = Color(0xFF191A1B)
    val darkElevated = Color(0xFF222324)
    val darkOutline = Color(0xFF363738)
    val darkText = Color(0xFFF4F2EE)
    val darkMutedText = Color(0xFFAAA9A5)
    val gold = Color(0xFFE4B85E)
    val goldSoft = Color(0xFFF0C96F)
    val goldOn = Color(0xFF201A0E)
    val error = Color(0xFFFF6B6B)
    val success = Color(0xFF62C89A)
    val warning = Color(0xFFE4B85E)

    val lightBackground = Color(0xFFF7F6F3)
    val lightSurface = Color(0xFFFFFFFF)
    val lightElevated = Color(0xFFF0EEE9)
    val lightOutline = Color(0xFFE3E0D8)
    val lightText = Color(0xFF20201E)
    val lightMutedText = Color(0xFF706F69)
}

// Legacy semantic names remain composable so existing screens follow the active theme.
val Primary: Color @Composable get() = MaterialTheme.colorScheme.primary
val PrimaryLight: Color @Composable get() = MaterialTheme.colorScheme.primaryContainer
val PrimaryDark: Color @Composable get() = MaterialTheme.colorScheme.onPrimaryContainer
val Secondary: Color @Composable get() = MaterialTheme.colorScheme.secondary
val SecondaryLight: Color @Composable get() = MaterialTheme.colorScheme.secondaryContainer
val SecondaryDark: Color @Composable get() = MaterialTheme.colorScheme.onSecondaryContainer
val Background: Color @Composable get() = MaterialTheme.colorScheme.background
val Surface: Color @Composable get() = MaterialTheme.colorScheme.surface
val TextPrimary: Color @Composable get() = MaterialTheme.colorScheme.onSurface
val TextSecondary: Color @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
val Border: Color @Composable get() = MaterialTheme.colorScheme.outline
val Error: Color @Composable get() = MaterialTheme.colorScheme.error
val Success: Color @Composable get() = MaddsPalette.success
val Warning: Color @Composable get() = MaddsPalette.warning
val BlueAccent: Color @Composable get() = MaterialTheme.colorScheme.secondary
val PurpleAccent: Color @Composable get() = MaterialTheme.colorScheme.primary
