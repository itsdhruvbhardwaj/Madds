package com.itsdhruvbhardwaj.picme.notifications

import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Installation token only; account association is owned by the authenticated backend. */
object PushRegistration {
    private val currentToken = MutableStateFlow<String?>(null)
    val token = currentToken.asStateFlow()

    fun refresh() {
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener(::updateToken)
            .addOnFailureListener {
                // Do not log registration tokens or Firebase configuration.
                Log.w("MaddsPush", "Push registration unavailable; will retry on next foreground")
            }
    }

    fun updateToken(token: String) {
        if (token.isNotBlank()) currentToken.value = token
    }
}
