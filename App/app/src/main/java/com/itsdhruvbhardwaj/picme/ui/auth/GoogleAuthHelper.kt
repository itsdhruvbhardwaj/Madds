package com.itsdhruvbhardwaj.picme.ui.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.itsdhruvbhardwaj.picme.BuildConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

class GoogleAuthHelper(private val context: Context) {
    private val credentialManager = CredentialManager.create(context)

    fun signIn(
        scope: CoroutineScope,
        onSuccess: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(BuildConfig.GOOGLE_CLIENT_ID)
            .setAutoSelectEnabled(true)
            .build()

        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()

        scope.launch {
            try {
                val result = credentialManager.getCredential(
                    context = context,
                    request = request
                )
                val credential = result.credential
                
                if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    try {
                        val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
                        onSuccess(googleIdTokenCredential.idToken)
                    } catch (e: Exception) {
                        onError("Failed to parse Google ID token credential")
                    }
                } else {
                    onError("Unexpected credential type: ${credential.type}")
                }
            } catch (e: Exception) {
                if (e is GetCredentialCancellationException) {
                    // User cancelled, do nothing as per requirement
                } else {
                    onError(e.localizedMessage ?: "Google Sign-In failed")
                }
            }
        }
    }
}
