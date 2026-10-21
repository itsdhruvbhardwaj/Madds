package com.itsdhruvbhardwaj.picme.ui.auth

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.model.User
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import com.itsdhruvbhardwaj.picme.utils.AdManager
import com.itsdhruvbhardwaj.picme.utils.RewardedAdLoadState
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * ViewModel responsible for managing authentication state and session restoration.
 * Communicates with [AuthRepository] to perform authentication actions.
 */
class AuthViewModel(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.CheckingSession)
    
    /**
     * Observable stream of the current authentication state.
     */
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _isRewardedAdLoading = MutableStateFlow(false)
    val isRewardedAdLoading: StateFlow<Boolean> = _isRewardedAdLoading.asStateFlow()

    // SharedFlow for transient UI events (like ad errors) that shouldn't disrupt the main auth state.
    private val _uiEvent = MutableSharedFlow<String>()
    val uiEvent: SharedFlow<String> = _uiEvent.asSharedFlow()

    private val checkSessionMutex = Mutex()
    
    // Temporary storage for credentials during deletion-pending login attempt
    private var pendingDeletionEmail: String? = null
    private var pendingDeletionPassword: String? = null

    init {
        // Optimistically initialize state from cache to speed up startup
        val cachedUser = authRepository.getCachedUser()
        if (cachedUser != null) {
            _authState.value = AuthState.Authenticated(cachedUser)
        } else if (authRepository.hasRefreshToken()) {
            // If tokens exist but profile isn't cached, show loading on Home instead of Splash
            _authState.value = AuthState.RestoringSession
        }
        
        // Background validation
        checkSession(isInitial = true)
    }

    /**
     * Checks for an existing session and attempts restoration if a refresh token exists.
     * Handles access token expiration by attempting a refresh automatically.
     */
    fun checkSession(isInitial: Boolean = false) {
        viewModelScope.launch {
            if (checkSessionMutex.isLocked) return@launch
            
            checkSessionMutex.withLock {
                val currentState = _authState.value
                
                // If the user has already logged out or is logging out, abort session checking
                if (currentState is AuthState.Unauthenticated) return@withLock

                // Only show global checking state if we don't have a valid session context to preserve.
                // This ensures a "silent refresh" for already authenticated users.
                if (currentState !is AuthState.Authenticated && currentState !is AuthState.RestoringSession) {
                    _authState.value = AuthState.CheckingSession
                }
                
                val userResult = authRepository.getCurrentUser()
                
                // Final check before updating state to ensure logout didn't happen during the network call
                if (_authState.value is AuthState.Unauthenticated) return@withLock

                if (userResult.isSuccess) {
                    _authState.value = AuthState.Authenticated(userResult.getOrThrow())
                } else {
                    val errorMessage = userResult.exceptionOrNull()?.message
                    
                    // If it's a network or server error, don't log out. Preserve tokens and cache.
                    if (errorMessage == "network_failure" || errorMessage == "server_failure" || errorMessage == "timeout") {
                        if (_authState.value !is AuthState.Authenticated) {
                            _authState.value = AuthState.SessionCheckNetworkError
                        }
                        return@withLock
                    }

                    // If access token is invalid/expired, attempt refresh.
                    val refreshResult = authRepository.refreshSession()
                    
                    // Re-check state after potential suspension
                    if (_authState.value is AuthState.Unauthenticated) return@withLock

                    if (refreshResult.isSuccess) {
                        val retryUserResult = authRepository.getCurrentUser()
                        if (_authState.value is AuthState.Unauthenticated) return@withLock

                        if (retryUserResult.isSuccess) {
                            _authState.value = AuthState.Authenticated(retryUserResult.getOrThrow())
                        } else {
                            handleSessionFailure(retryUserResult.exceptionOrNull()?.message)
                        }
                    } else {
                        handleSessionFailure(refreshResult.exceptionOrNull()?.message)
                    }
                }
            }
        }
    }

    private fun handleSessionFailure(error: String?) {
        if (error == "network_failure" || error == "server_failure" || error == "timeout") {
            if (_authState.value !is AuthState.Authenticated) {
                _authState.value = AuthState.SessionCheckNetworkError
            }
        } else {
            // Definitive auth failure (401/403/expired refresh token)
            _authState.value = AuthState.Unauthenticated
        }
    }

    /**
     * Performs standard email/password login.
     */
    fun login(email: String, password: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.login(email, password)
            handleAuthResult(result, email, password)
        }
    }

    /**
     * Performs standard user registration.
     */
    fun signup(name: String, email: String, password: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.register(name, email, password)
            result.fold(
                onSuccess = {
                    // After registration, the user needs to verify their email.
                    _authState.value = AuthState.VerifyEmailRequired(email)
                },
                onFailure = { error ->
                    if (error.message == "email_already_exists") {
                        _authState.value = AuthState.EmailAlreadyExists
                    } else {
                        _authState.value = AuthState.Error(mapError(error.message))
                    }
                }
            )
        }
    }

    /**
     * Performs email verification with the provided token.
     */
    fun verifyEmail(token: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.verifyEmail(token)
            result.fold(
                onSuccess = { user ->
                    _authState.value = AuthState.Authenticated(user)
                },
                onFailure = { error ->
                    val errorMessage = error.message ?: ""
                    if (errorMessage == "verification_success_no_tokens") {
                        _authState.value = AuthState.VerificationSuccess("Email verified successfully. Please sign in to continue.")
                    } else {
                        _authState.value = AuthState.Error(mapError(errorMessage))
                    }
                }
            )
        }
    }

    /**
     * Resends the verification email.
     */
    fun resendVerification(email: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.resendVerification(email)
            result.fold(
                onSuccess = {
                    _authState.value = AuthState.VerifyEmailRequired(email)
                },
                onFailure = { error ->
                    _authState.value = AuthState.Error(mapError(error.message))
                }
            )
        }
    }

    /**
     * Initiates the password reset process.
     */
    fun forgotPassword(email: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.forgotPassword(email)
            result.fold(
                onSuccess = { message ->
                    _authState.value = AuthState.PasswordResetSent(message)
                },
                onFailure = { error ->
                    _authState.value = AuthState.Error(mapError(error.message))
                }
            )
        }
    }

    /**
     * Completes the password reset process with a token.
     */
    fun resetPassword(token: String, newPassword: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.resetPassword(token, newPassword)
            result.fold(
                onSuccess = { message ->
                    _authState.value = AuthState.PasswordResetSuccess(message)
                },
                onFailure = { error ->
                    _authState.value = AuthState.Error(mapError(error.message))
                }
            )
        }
    }

    /**
     * Requests account deletion.
     */
    fun deleteAccount(password: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.deleteAccount(password)
            result.fold(
                onSuccess = { scheduledAt ->
                    val dateMsg = if (scheduledAt.isNotEmpty()) " on $scheduledAt" else ""
                    _authState.value = AuthState.Unauthenticated
                    _uiEvent.emit("Account scheduled for deletion$dateMsg. You have 30 days to cancel by signing in.")
                },
                onFailure = { error ->
                    _authState.value = AuthState.Authenticated(authRepository.getCachedUser()!!)
                    _uiEvent.emit(mapError(error.message))
                }
            )
        }
    }

    /**
     * Cancels a pending account deletion and logs the user in.
     */
    fun cancelDeletion() {
        val email = pendingDeletionEmail ?: return
        val password = pendingDeletionPassword ?: return
        
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.cancelDeletion(email, password)
            handleAuthResult(result)
        }
    }

    /**
     * Performs authentication using a Google ID token.
     */
    fun loginWithGoogle(idToken: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.googleAuth(idToken)
            handleAuthResult(result)
        }
    }

    /**
     * Logs out the user from the current session and clears local state.
     */
    fun logout() {
        // Immediately mark as unauthenticated to prevent auto-redirects from Login back to Home
        _authState.value = AuthState.Unauthenticated
        
        viewModelScope.launch {
            // Clearing local storage and backend logout is handled as a background task
            authRepository.logout()
        }
    }

    /**
     * Revokes all active sessions for the user and clears local state.
     */
    fun logoutAll() {
        _authState.value = AuthState.Unauthenticated
        viewModelScope.launch {
            authRepository.logoutAll()
        }
    }

    /**
     * Initiates the rewarded ad flow: fetches a ticket, shows the ad, and refreshes the balance.
     */
    fun startRewardedAdFlow(activity: Activity) {
        if (_isRewardedAdLoading.value) return

        viewModelScope.launch {
            _isRewardedAdLoading.value = true
            
            val adState = AdManager.rewardedAdState.value
            
            // Check current load state
            when (adState) {
                is RewardedAdLoadState.Error -> {
                    // Expose the actual error details for diagnostics
                    _uiEvent.emit("Ad failed: ${adState.message} (Code: ${adState.code})")
                    AdManager.loadRewardedAd(activity) // Attempt to reload
                    _isRewardedAdLoading.value = false
                    return@launch
                }
                is RewardedAdLoadState.Ready -> {
                    // Ad is ready, proceed to request ticket
                }
                else -> {
                    // Idle or Loading
                    AdManager.loadRewardedAd(activity)
                    _uiEvent.emit("Ad is loading. Please try again shortly.")
                    _isRewardedAdLoading.value = false
                    return@launch
                }
            }

            val result = authRepository.requestRewardAttempt()
            
            result.fold(
                onSuccess = { response ->
                    val customData = response.customData
                    if (!customData.isNullOrBlank()) {
                        AdManager.showRewardedAd(
                            activity = activity,
                            customData = customData,
                            onRewardEarned = {
                                viewModelScope.launch {
                                    // Give the backend a moment to process the SSV callback
                                    delay(2000)
                                    checkSession()
                                }
                            },
                            onAdDismissed = {
                                _isRewardedAdLoading.value = false
                                // Preload next one
                                AdManager.loadRewardedAd(activity)
                            }
                        )
                    } else {
                        _isRewardedAdLoading.value = false
                        _uiEvent.emit("Failed to prepare reward attempt.")
                    }
                },
                onFailure = { error ->
                    _isRewardedAdLoading.value = false
                    _uiEvent.emit(mapError(error.message))
                }
            )
        }
    }

    private fun handleAuthResult(result: Result<User>, email: String? = null, password: String? = null) {
        result.fold(
            onSuccess = { user ->
                pendingDeletionEmail = null
                pendingDeletionPassword = null
                _authState.value = AuthState.Authenticated(user)
            },
            onFailure = { error ->
                val message = error.message ?: ""
                if (message.startsWith("deletion_pending")) {
                    val date = message.substringAfter("|", "")
                    pendingDeletionEmail = email
                    pendingDeletionPassword = password
                    _authState.value = AuthState.DeletionPending(date.takeIf { it.isNotEmpty() })
                } else {
                    _authState.value = AuthState.Error(mapError(message))
                }
            }
        )
    }

    private fun mapError(message: String?): String {
        val cleanMsg = message ?: ""
        return when {
            cleanMsg == "invalid_credentials" -> "Incorrect email or password. Please try again."
            cleanMsg == "unverified_account" -> "Your account has been created, but your email hasn't been verified yet. Check your inbox and Spam/Junk folder."
            cleanMsg == "email_already_exists" -> "An account with this email already exists. Try logging in instead."
            cleanMsg == "google_reauth_required" -> "Password confirmation is not available for this Google account. Re-authentication via Google is required."
            cleanMsg.contains("invalid", ignoreCase = true) && cleanMsg.contains("token", ignoreCase = true) -> "This link is invalid or has expired. Request a new one."
            cleanMsg == "network_failure" -> "Unable to connect. Check your internet connection and try again."
            cleanMsg == "server_failure" -> "PicMe is temporarily unavailable. Please try again shortly."
            cleanMsg == "timeout" -> "Connection timed out. Please try again."
            else -> cleanMsg.takeIf { it.isNotEmpty() } ?: "An unexpected error occurred. Please try again."
        }
    }

    /**
     * Resets the auth state to unauthenticated.
     */
    fun resetAuthState() {
        _authState.value = AuthState.Unauthenticated
        pendingDeletionEmail = null
        pendingDeletionPassword = null
    }
}
