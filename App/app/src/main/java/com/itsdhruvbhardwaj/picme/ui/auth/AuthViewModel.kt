package com.itsdhruvbhardwaj.picme.ui.auth

import android.app.Activity
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.android.billingclient.api.Purchase
import com.itsdhruvbhardwaj.picme.data.model.User
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import com.itsdhruvbhardwaj.picme.utils.AdManager
import com.itsdhruvbhardwaj.picme.utils.BillingManager
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
 * Also handles Rewarded Ads and Google Play Billing flows.
 */
class AuthViewModel(
    private val authRepository: AuthRepository,
    private val billingManager: BillingManager? = null
) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.CheckingSession)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private val _passwordSetupState = MutableStateFlow<PasswordSetupState>(PasswordSetupState.Idle)
    val passwordSetupState: StateFlow<PasswordSetupState> = _passwordSetupState.asStateFlow()

    private val _isRewardedAdLoading = MutableStateFlow(false)
    val isRewardedAdLoading: StateFlow<Boolean> = _isRewardedAdLoading.asStateFlow()

    private val _isPurchaseLoading = MutableStateFlow(false)
    val isPurchaseLoading: StateFlow<Boolean> = _isPurchaseLoading.asStateFlow()

    private val _isDeletionCancellationLoading = MutableStateFlow(false)
    val isDeletionCancellationLoading: StateFlow<Boolean> = _isDeletionCancellationLoading.asStateFlow()

    val productDetails = billingManager?.productDetails ?: MutableStateFlow(null).asStateFlow()

    // SharedFlow for transient UI events (like ad errors or purchase success)
    private val _uiEvent = MutableSharedFlow<String>()
    val uiEvent: SharedFlow<String> = _uiEvent.asSharedFlow()

    private val checkSessionMutex = Mutex()
    private val purchaseVerificationMutex = Mutex()

    // Temporary storage for credentials during deletion-pending login attempt
    private var pendingDeletionEmail: String? = null
    private var pendingDeletionPassword: String? = null
    private var pendingDeletionGoogleIdToken: String? = null

    init {
        // Optimistically initialize state from cache to speed up startup
        val cachedUser = authRepository.getCachedUser()
        if (cachedUser != null) {
            _authState.value = AuthState.Authenticated(cachedUser)
        } else if (authRepository.hasRefreshToken()) {
            _authState.value = AuthState.RestoringSession
        }

        // Background validation
        checkSession(isInitial = true)

        // Observe billing events
        viewModelScope.launch {
            billingManager?.billingEvent?.collect { event ->
                when (event) {
                    is BillingManager.BillingEvent.PurchaseSuccess -> {
                        handlePurchase(event.purchase)
                    }
                    is BillingManager.BillingEvent.Error -> {
                        _uiEvent.emit(event.message)
                        _isPurchaseLoading.value = false
                    }
                    BillingManager.BillingEvent.Canceled -> {
                        _uiEvent.emit("Purchase canceled.")
                        _isPurchaseLoading.value = false
                    }
                    BillingManager.BillingEvent.Pending -> {
                        _uiEvent.emit("Purchase is pending. Credits will be added once complete.")
                        _isPurchaseLoading.value = false
                    }
                    BillingManager.BillingEvent.ServiceDisconnected -> {
                        // BillingManager handles reconnection internally on next interaction
                    }
                }
            }
        }
    }

    /**
     * Checks for an existing session and attempts restoration.
     */
    fun checkSession(isInitial: Boolean = false) {
        viewModelScope.launch {
            if (checkSessionMutex.isLocked) return@launch

            checkSessionMutex.withLock {
                val currentState = _authState.value
                if (currentState is AuthState.Unauthenticated) return@withLock

                if (currentState !is AuthState.Authenticated && currentState !is AuthState.RestoringSession) {
                    _authState.value = AuthState.CheckingSession
                }

                val userResult = authRepository.getCurrentUser()
                if (_authState.value is AuthState.Unauthenticated) return@withLock

                if (userResult.isSuccess) {
                    _authState.value = AuthState.Authenticated(userResult.getOrThrow())
                } else {
                    val errorMessage = userResult.exceptionOrNull()?.message
                    if (errorMessage == "network_failure" || errorMessage == "server_failure" || errorMessage == "timeout") {
                        if (_authState.value !is AuthState.Authenticated) {
                            _authState.value = AuthState.SessionCheckNetworkError
                        }
                        return@withLock
                    }

                    val refreshResult = authRepository.refreshSession()
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
            _authState.value = AuthState.Unauthenticated
        }
    }

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.login(email, password)
            handleAuthResult(result, email, password)
        }
    }

    fun signup(name: String, email: String, password: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.register(name, email, password)
            result.fold(
                onSuccess = { _authState.value = AuthState.VerifyEmailRequired(email) },
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

    fun verifyEmail(token: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.verifyEmail(token)
            result.fold(
                onSuccess = { user -> _authState.value = AuthState.Authenticated(user) },
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

    fun resendVerification(email: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.resendVerification(email)
            result.fold(
                onSuccess = { _authState.value = AuthState.VerifyEmailRequired(email) },
                onFailure = { error -> _authState.value = AuthState.Error(mapError(error.message)) }
            )
        }
    }

    fun startRewardedAdFlow(activity: Activity) {
        if (_isRewardedAdLoading.value) return

        viewModelScope.launch {
            _isRewardedAdLoading.value = true
            val adState = AdManager.rewardedAdState.value

            when (adState) {
                is RewardedAdLoadState.Error -> {
                    val userMessage = if (adState.code == 3) "No ad is available right now. Please try again later." else "Ad failed: ${adState.message} (Code: ${adState.code})"
                    _uiEvent.emit(userMessage)
                    AdManager.loadRewardedAd(activity)
                    _isRewardedAdLoading.value = false
                    return@launch
                }
                is RewardedAdLoadState.Ready -> {}
                else -> {
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
                        AdManager.showRewardedAd(activity, customData, {
                            viewModelScope.launch { delay(2000); checkSession() }
                        }, { _isRewardedAdLoading.value = false; AdManager.loadRewardedAd(activity) })
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

    /**
     * Starts the Google Play Billing purchase flow for the credit pack.
     */
    fun startPurchaseFlow(activity: Activity) {
        if (_isPurchaseLoading.value) return
        _isPurchaseLoading.value = true
        billingManager?.launchPurchaseFlow(activity)
    }

    private fun handlePurchase(purchase: Purchase) {
        viewModelScope.launch {
            purchaseVerificationMutex.withLock {
                _isPurchaseLoading.value = true
                val result = authRepository.verifyPurchase(
                    productId = purchase.products.firstOrNull() ?: "",
                    purchaseToken = purchase.purchaseToken,
                    purchaseOptionId = "buy-250-credits" // Fixed option ID for this product
                )

                result.fold(
                    onSuccess = {
                        _uiEvent.emit("Purchase successful! Credits added.")
                        checkSession() // Refresh user profile/balance
                    },
                    onFailure = { error ->
                        Log.e("AuthViewModel", "Purchase verification failed: ${error.message}")
                        _uiEvent.emit("Verification failed: ${error.message}. We will retry shortly.")
                    }
                )
                _isPurchaseLoading.value = false
            }
        }
    }

    /**
     * Retries fulfillment for any pending purchases.
     */
    fun processPendingPurchases() {
        billingManager?.queryPurchases { purchases ->
            purchases.filter { it.purchaseState == Purchase.PurchaseState.PURCHASED }.forEach {
                handlePurchase(it)
            }
        }
    }

    fun forgotPassword(email: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.forgotPassword(email)
            result.fold(
                onSuccess = { _authState.value = AuthState.PasswordResetSent(it) },
                onFailure = { error -> _authState.value = AuthState.Error(mapError(error.message)) }
            )
        }
    }

    fun resetPassword(token: String, newPassword: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.resetPassword(token, newPassword)
            result.fold(
                onSuccess = { _authState.value = AuthState.PasswordResetSuccess(it) },
                onFailure = { error -> _authState.value = AuthState.Error(mapError(error.message)) }
            )
        }
    }

    fun deleteAccount(password: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.deleteAccount(password)
            result.fold(
                onSuccess = {
                    _authState.value = AuthState.Unauthenticated
                    _uiEvent.emit("Account scheduled for deletion on $it. You have 30 days to cancel.")
                },
                onFailure = {
                    authRepository.getCachedUser()?.let { _authState.value = AuthState.Authenticated(it) }
                    _uiEvent.emit(mapError(it.message))
                }
            )
        }
    }

    fun requestGooglePasswordSetup(password: String, confirmPassword: String) {
        viewModelScope.launch {
            _passwordSetupState.value = PasswordSetupState.Sending
            authRepository.requestGooglePasswordSetup(password, confirmPassword).fold(
                onSuccess = { _passwordSetupState.value = PasswordSetupState.EmailSent(it) },
                onFailure = { _passwordSetupState.value = PasswordSetupState.Error(mapError(it.message)) }
            )
        }
    }

    fun verifyGooglePasswordSetup(token: String) {
        viewModelScope.launch {
            _passwordSetupState.value = PasswordSetupState.Verifying
            authRepository.verifyGooglePasswordSetup(token).fold(
                onSuccess = {
                    val currentUser = authRepository.getCurrentUser()
                    currentUser.fold(
                        onSuccess = { user ->
                            _authState.value = AuthState.Authenticated(user)
                            _passwordSetupState.value = PasswordSetupState.Verified
                        },
                        onFailure = { _passwordSetupState.value = PasswordSetupState.Error(mapError(it.message)) }
                    )
                },
                onFailure = { _passwordSetupState.value = PasswordSetupState.Error(mapError(it.message)) }
            )
        }
    }

    fun refreshGooglePasswordSetupStatus() {
        viewModelScope.launch {
            val result = authRepository.getCurrentUser()
            result.fold(
                onSuccess = { user ->
                    _authState.value = AuthState.Authenticated(user)
                    _passwordSetupState.value = if (user.hasPassword) {
                        PasswordSetupState.Verified
                    } else {
                        PasswordSetupState.EmailSent("Check your inbox and verify the password setup link.")
                    }
                },
                onFailure = { _passwordSetupState.value = PasswordSetupState.Error(mapError(it.message)) }
            )
        }
    }

    fun resetPasswordSetupState() {
        _passwordSetupState.value = PasswordSetupState.Idle
    }

    fun cancelDeletion() {
        val googleIdToken = pendingDeletionGoogleIdToken
        val email = pendingDeletionEmail
        val password = pendingDeletionPassword
        if (googleIdToken == null && (email == null || password == null)) return
        if (_isDeletionCancellationLoading.value) return
        viewModelScope.launch {
            _isDeletionCancellationLoading.value = true
            try {
                val result = if (googleIdToken != null) {
                    authRepository.cancelDeletionWithGoogle(googleIdToken)
                } else {
                    authRepository.cancelDeletion(email!!, password!!)
                }
                result.fold(
                    onSuccess = { user ->
                        pendingDeletionEmail = null
                        pendingDeletionPassword = null
                        pendingDeletionGoogleIdToken = null
                        _authState.value = AuthState.Authenticated(user)
                    },
                    onFailure = { error ->
                        _uiEvent.emit(mapError(error.message))
                    }
                )
            } finally {
                _isDeletionCancellationLoading.value = false
            }
        }
    }

    fun loginWithGoogle(idToken: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Authenticating
            val result = authRepository.googleAuth(idToken)
            handleAuthResult(result, googleIdToken = idToken)
        }
    }

    fun logout() {
        _authState.value = AuthState.Unauthenticated
        viewModelScope.launch { authRepository.logout() }
    }

    fun logoutAll() {
        _authState.value = AuthState.Unauthenticated
        viewModelScope.launch { authRepository.logoutAll() }
    }

    private fun handleAuthResult(
        result: Result<User>,
        email: String? = null,
        password: String? = null,
        googleIdToken: String? = null
    ) {
        result.fold(
            onSuccess = { user ->
                pendingDeletionEmail = null
                pendingDeletionPassword = null
                pendingDeletionGoogleIdToken = null
                _authState.value = AuthState.Authenticated(user)
            },
            onFailure = { error ->
                val message = error.message ?: ""
                if (message.startsWith("deletion_pending")) {
                    val date = message.substringAfter("|", "")
                    pendingDeletionEmail = email
                    pendingDeletionPassword = password
                    pendingDeletionGoogleIdToken = googleIdToken
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
            cleanMsg == "google_authentication_failed" -> "Google sign-in could not be verified. Sign in again with the Google account scheduled for deletion."
            cleanMsg == "google_account_mismatch" -> "This Google account does not match the Madds account scheduled for deletion."
            cleanMsg == "unverified_account" -> "Your account has been created, but your email hasn't been verified yet."
            cleanMsg == "email_already_exists" -> "An account with this email already exists."
            cleanMsg.contains("invalid", ignoreCase = true) && cleanMsg.contains("token", ignoreCase = true) -> "This link is invalid or has expired."
            cleanMsg == "network_failure" -> "Unable to connect. Check your internet connection."
            cleanMsg == "server_failure" -> "madds is temporarily unavailable."
            cleanMsg == "timeout" -> "Connection timed out."
            else -> cleanMsg.takeIf { it.isNotEmpty() } ?: "An unexpected error occurred."
        }
    }

    fun resetAuthState() {
        _authState.value = AuthState.Unauthenticated
        pendingDeletionEmail = null
        pendingDeletionPassword = null
        pendingDeletionGoogleIdToken = null
        _isDeletionCancellationLoading.value = false
    }

    override fun onCleared() {
        billingManager?.endConnection()
    }
}
