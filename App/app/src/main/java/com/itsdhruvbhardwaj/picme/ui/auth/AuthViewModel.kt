package com.itsdhruvbhardwaj.picme.ui.auth

import android.app.Activity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.model.User
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import com.itsdhruvbhardwaj.picme.utils.AdManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
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

    private val checkSessionMutex = Mutex()

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
                // Only show global checking state if we don't have a local session baseline
                val currentState = _authState.value
                if (!isInitial || (currentState !is AuthState.Authenticated && currentState !is AuthState.RestoringSession)) {
                    _authState.value = AuthState.CheckingSession
                }
                
                val userResult = authRepository.getCurrentUser()
                
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
                    
                    if (refreshResult.isSuccess) {
                        val retryUserResult = authRepository.getCurrentUser()
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
            handleAuthResult(result)
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
        viewModelScope.launch {
            authRepository.logout()
            _authState.value = AuthState.Unauthenticated
        }
    }

    /**
     * Revokes all active sessions for the user and clears local state.
     */
    fun logoutAll() {
        viewModelScope.launch {
            authRepository.logoutAll()
            _authState.value = AuthState.Unauthenticated
        }
    }

    /**
     * Initiates the rewarded ad flow: fetches a ticket, shows the ad, and refreshes the balance.
     */
    fun startRewardedAdFlow(activity: Activity) {
        if (_isRewardedAdLoading.value) return

        viewModelScope.launch {
            _isRewardedAdLoading.value = true
            
            val result = authRepository.requestRewardAttempt()
            
            result.fold(
                onSuccess = { response ->
                    val ticket = response.ticket
                    if (ticket != null) {
                        AdManager.showRewardedAd(
                            activity = activity,
                            customData = ticket,
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
                        _authState.value = AuthState.Error("Failed to prepare reward attempt.")
                    }
                },
                onFailure = { error ->
                    _isRewardedAdLoading.value = false
                    _authState.value = AuthState.Error(mapError(error.message))
                }
            )
        }
    }

    private fun handleAuthResult(result: Result<User>) {
        result.fold(
            onSuccess = { user ->
                _authState.value = AuthState.Authenticated(user)
            },
            onFailure = { error ->
                _authState.value = AuthState.Error(mapError(error.message))
            }
        )
    }

    private fun mapError(message: String?): String {
        return when (message) {
            "invalid_credentials" -> "Incorrect email or password. Please try again."
            "unverified_account" -> "Your account has been created, but your email hasn't been verified yet. Check your inbox and Spam/Junk folder."
            "email_already_exists" -> "An account with this email already exists. Try logging in instead."
            "invalid_token", "expired_token", "token_already_used" -> "This verification link is invalid or has expired. Request a new one."
            "network_failure" -> "Unable to connect. Check your internet connection and try again."
            "server_failure" -> "PicMe is temporarily unavailable. Please try again shortly."
            "timeout" -> "Connection timed out. Please try again."
            else -> message ?: "An unexpected error occurred. Please try again."
        }
    }

    /**
     * Resets the auth state to unauthenticated.
     */
    fun resetAuthState() {
        _authState.value = AuthState.Unauthenticated
    }
}
