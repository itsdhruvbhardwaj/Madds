package com.itsdhruvbhardwaj.picme.ui.auth

import android.content.Context
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.*
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import com.itsdhruvbhardwaj.picme.BuildConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.io.IOException

class GoogleAuthHelper(
    private val context: Context,
    private val credentialManager: CredentialManager = CredentialManager.create(context),
    private val diagnose: (String) -> Unit = { Log.i("MaddsGoogleSignIn", it); Unit }
) {
    private val _isSigningIn = MutableStateFlow(false)
    val isSigningIn = _isSigningIn.asStateFlow()

    fun signIn(scope: CoroutineScope, onSuccess: (String) -> Unit, onError: (String) -> Unit) {
        if (!_isSigningIn.compareAndSet(false, true)) return
        // Completion releases the guard even if the scope was cancelled before launch ran.
        scope.launch {
            try {
                diagnose("CREDENTIAL_REQUEST_STARTED")
                val token = try {
                    val request = GetCredentialRequest.Builder()
                        .addCredentialOption(GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_CLIENT_ID).build())
                        .build()
                    val result = withTimeoutOrNull(90_000) {
                        credentialManager.getCredential(context = context, request = request)
                    }
                    if (result == null) {
                        diagnose("CREDENTIAL_REQUEST_TIMEOUT")
                        onError("Google sign-in took too long. Check your connection and tap Continue with Google again.")
                        return@launch
                    }
                    val credential = result.credential
                    if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                        diagnose("UNEXPECTED_CREDENTIAL_TYPE")
                        onError("Google couldn't complete sign-in. Please try again, or use email sign-in.")
                        return@launch
                    }
                    GoogleIdTokenCredential.createFrom(credential.data).idToken
                } catch (_: GetCredentialCancellationException) {
                    diagnose("CREDENTIAL_REQUEST_CANCELLED")
                    return@launch // Never reopen an account picker after a user cancels.
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // No provider messages, account details, or tokens in diagnostics.
                    diagnose("CREDENTIAL_REQUEST_FAILED kind=${e.javaClass.simpleName}")
                    onError(GoogleSignInErrors.credentialMessage(e))
                    return@launch
                }
                diagnose("CREDENTIAL_RECEIVED")
                onSuccess(token)
            } finally {
                _isSigningIn.value = false
            }
        }.invokeOnCompletion { _isSigningIn.value = false }
    }
}

internal object GoogleSignInErrors {
    fun credentialMessage(error: Exception): String = when (error) {
        is NoCredentialException -> "Google couldn't find an available account. Check that a Google account is signed in on this phone and doesn't need verification, then try again. You can also use email sign-in."
        is GetCredentialInterruptedException -> "Google sign-in was interrupted. Please tap Continue with Google again."
        is GetCredentialProviderConfigurationException, is GetCredentialUnsupportedException -> "Google sign-in isn't available on this device right now. Update Google Play services and try again, or use email sign-in."
        is GoogleIdTokenParsingException -> "Google returned an unreadable sign-in response. Please try again. If it continues, update Google Play services or use email sign-in."
        is IOException -> "Couldn't connect to Google. Check your internet connection and try again."
        else -> "Google couldn't complete sign-in. Check your connection and try again. If it continues, use email sign-in."
    }

    fun backendMessage(code: String?): String = when {
        code == "timeout" || code == "network_failure" -> "Couldn't finish signing in to Madds. Check your connection and tap Continue with Google again."
        code == "google_authentication_failed" || code == "invalid_credentials" || code == "invalid_token" || code == "expired_token" -> "Google sign-in couldn't be verified. Please tap Continue with Google to sign in again."
        code == "rate_limited" -> "There have been too many sign-in attempts. Please wait a few minutes and try again."
        else -> "Madds couldn't complete Google sign-in right now. Please try again shortly."
    }
}
