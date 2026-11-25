package com.itsdhruvbhardwaj.picme.ui.components

import androidx.compose.runtime.staticCompositionLocalOf

/** Every entry point opens the same host and purchase implementation. */
data class CreditsRequest(val requiredCredits: Int? = null, val availableCredits: Int? = null)
val LocalCreditsLauncher = staticCompositionLocalOf<(CreditsRequest) -> Unit> {
    { error("Credits host is missing") }
}
