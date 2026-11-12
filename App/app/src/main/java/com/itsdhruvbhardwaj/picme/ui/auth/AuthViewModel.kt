package com.itsdhruvbhardwaj.picme.ui.auth

import android.app.Activity
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.android.billingclient.api.Purchase
import com.itsdhruvbhardwaj.picme.data.model.User
import com.itsdhruvbhardwaj.picme.data.model.PurchaseHistoryItem
import com.itsdhruvbhardwaj.picme.data.model.CreditHistoryItem
import com.itsdhruvbhardwaj.picme.data.model.ProfileAppearanceRequest
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import com.itsdhruvbhardwaj.picme.utils.AdManager
import com.itsdhruvbhardwaj.picme.utils.BillingManager
import com.itsdhruvbhardwaj.picme.utils.billingAccountId
import com.itsdhruvbhardwaj.picme.utils.RewardedAdLoadState
import kotlinx.coroutines.delay
import kotlinx.coroutines.Job
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
    private val _passwordResetEmailState = MutableStateFlow<PasswordResetEmailState>(PasswordResetEmailState.Idle)
    val passwordResetEmailState = _passwordResetEmailState.asStateFlow()
    private val _isDeletingAccount = MutableStateFlow(false)
    val isDeletingAccount = _isDeletingAccount.asStateFlow()
    private var verifyingSetupToken: String? = null
    private var verifiedSetupToken: String? = null

    private val _isRewardedAdLoading = MutableStateFlow(false)
    val isRewardedAdLoading: StateFlow<Boolean> = _isRewardedAdLoading.asStateFlow()

    private val _rewardedAdConfig = MutableStateFlow<com.itsdhruvbhardwaj.picme.data.model.RewardedAdConfigResponse?>(null)
    val rewardedAdConfig = _rewardedAdConfig.asStateFlow()
    private val _rewardConfigLoading = MutableStateFlow(false)
    val rewardConfigLoading = _rewardConfigLoading.asStateFlow()
    fun refreshRewardConfig() {
        if (_rewardConfigLoading.value) return
        _rewardConfigLoading.value = true
        viewModelScope.launch {
            try {
                authRepository.getRewardedAdConfig().fold(
                    onSuccess = { _rewardedAdConfig.value = it },
                    onFailure = { _rewardedAdConfig.value = null }
                )
            } finally { _rewardConfigLoading.value = false }
        }
    }

    private val _isPurchaseLoading = MutableStateFlow(false)
    val isPurchaseLoading: StateFlow<Boolean> = _isPurchaseLoading.asStateFlow()

    private val _isDeletionCancellationLoading = MutableStateFlow(false)
    val isDeletionCancellationLoading: StateFlow<Boolean> = _isDeletionCancellationLoading.asStateFlow()

    val creditProducts = billingManager?.products ?: MutableStateFlow<Map<String, com.android.billingclient.api.ProductDetails>>(emptyMap()).asStateFlow()
    val productDetails = billingManager?.productDetails ?: MutableStateFlow(null).asStateFlow()
    val creditProductLoading = billingManager?.productLoading ?: MutableStateFlow(false).asStateFlow()
    val creditProductError = billingManager?.productError ?: MutableStateFlow<String?>(null).asStateFlow()
    fun refreshCreditProduct() { billingManager?.refreshCreditProduct() }
    suspend fun getPurchases(page: Int = 1) = authRepository.getPurchases(page)
    suspend fun finishAppTour(ownerId: String, request: com.itsdhruvbhardwaj.picme.data.model.AppTourResponse) = authRepository.finishAppTour(ownerId, request)
    suspend fun claimEngagementPrompt(ownerId: String, request: com.itsdhruvbhardwaj.picme.data.model.EngagementClaimRequest) = authRepository.claimEngagementPrompt(ownerId, request)
    suspend fun respondEngagementPrompt(ownerId: String, request: com.itsdhruvbhardwaj.picme.data.model.EngagementResponseRequest) = authRepository.respondEngagementPrompt(ownerId, request)
    suspend fun sendFeedback(request: com.itsdhruvbhardwaj.picme.data.model.FeedbackRequest) = authRepository.sendFeedback(request)
    suspend fun getCreditHistory(page: Int = 1) = authRepository.getCreditHistory(page)

    // SharedFlow for transient UI events (like ad errors or purchase success)
    private val _uiEvent = MutableSharedFlow<String>()
    val uiEvent: SharedFlow<String> = _uiEvent.asSharedFlow()

    private val checkSessionMutex = Mutex()
    private val purchaseVerificationMutex = Mutex()
    private val verifiedPurchases = mutableSetOf<String>()

    suspend fun completeStylePreferenceSetup(preference: String): Result<User> =
        authRepository.completeStylePreferenceSetup(preference).also { applyProfileUpdate(it) }

    suspend fun saveProfileAppearance(request: ProfileAppearanceRequest): Result<User> =
        authRepository.updateProfileAppearance(request).also { applyProfileUpdate(it) }

    suspend fun saveProfilePhoto(jpeg: ByteArray): Result<User> =
        authRepository.uploadProfilePhoto(jpeg).also { applyProfileUpdate(it) }

    private fun applyProfileUpdate(result: Result<User>) {
        result.onSuccess { user ->
            if ((_authState.value as? AuthState.Authenticated)?.user?.id == user.id) {
                _authState.value = AuthState.Authenticated(user)
            }
        }
    }

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
    fun checkSession(isInitial: Boolean = false): Job =
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
                    if (isInitial) processPendingPurchases()
                } else {
                    val errorMessage = userResult.exceptionOrNull()?.message
                    if (isTemporarySessionError(errorMessage)) {
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

    private fun handleSessionFailure(error: String?) {
        if (isTemporarySessionError(error)) {
            if (_authState.value !is AuthState.Authenticated) {
                _authState.value = AuthState.SessionCheckNetworkError
            }
        } else {
            val safeReason = when (error) {
                "session_expired" -> "session_expired"
                "No refresh token available" -> "missing_refresh_token"
                null -> "unknown"
                else -> "non_network_session_failure"
            }
            Log.w("MaddsAuth", "session restoration ended unauthenticated; reason=$safeReason")
            _authState.value = AuthState.Unauthenticated
        }
    }

    private fun isTemporarySessionError(error: String?): Boolean =
        error == "network_failure" || error == "network_error" || error == "timeout" ||
            error == "rate_limited" || error == "server_failure" || error?.startsWith("server_failure (") == true

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
        if (!com.itsdhruvbhardwaj.picme.utils.AdPolicy.config.value.let { it.enabled && it.rewardedEnabled }) return
        if (_isRewardedAdLoading.value || _isPurchaseLoading.value) return
        val displayedReward = _rewardedAdConfig.value?.takeIf { it.validReward }?.credits
        if (displayedReward == null) { refreshRewardConfig(); return }
        // Lock before launching so rapid taps cannot create multiple attempts.
        _isRewardedAdLoading.value = true
        viewModelScope.launch {
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
                    val actualReward = response.credits
                    if (actualReward == null || actualReward !in 1..100_000) {
                        _isRewardedAdLoading.value = false
                        _uiEvent.emit("Couldn't confirm the ad reward. Please try again later.")
                        return@fold
                    }
                    if (actualReward != displayedReward) {
                        _rewardedAdConfig.value = com.itsdhruvbhardwaj.picme.data.model.RewardedAdConfigResponse(true, true, actualReward)
                        _isRewardedAdLoading.value = false
                        _uiEvent.emit("The ad reward is now $actualReward credits. Tap again to watch.")
                        return@fold
                    }
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
    fun startPurchaseFlow(activity: Activity, productId: String = BillingManager.CREDIT_PRODUCT_ID) {
        if (_isPurchaseLoading.value) return
        val userId = authRepository.getCachedUser()?.id
        if (userId == null || billingManager == null) {
            viewModelScope.launch { _uiEvent.emit("Please sign in before buying credits.") }
            return
        }
        _isPurchaseLoading.value = true
        billingManager.launchPurchaseFlow(activity, userId, productId)
    }

    private fun handlePurchase(purchase: Purchase) {
        viewModelScope.launch {
            purchaseVerificationMutex.withLock {
                val userId = authRepository.getCachedUser()?.id ?: run { _isPurchaseLoading.value = false; return@withLock }
                val account = purchase.accountIdentifiers?.obfuscatedAccountId
                if (account != null && account != billingAccountId(userId)) {
                    _isPurchaseLoading.value = false
                    _uiEvent.emit("Sign in to the Madds account used for this purchase to receive its credits.")
                    return@withLock
                }
                val key = "$userId:${purchase.purchaseToken}"
                if (key in verifiedPurchases) { _isPurchaseLoading.value = false; return@withLock }
                _isPurchaseLoading.value = true
                try {
                val result = authRepository.verifyPurchase(
                    productId = purchase.products.firstOrNull() ?: "",
                    purchaseToken = purchase.purchaseToken,
                    purchaseOptionId = BillingManager.optionId(purchase.products.firstOrNull() ?: "")
                )
                if (authRepository.getCachedUser()?.id != userId) return@withLock
                result.fold(
                    onSuccess = { response ->
                        verifiedPurchases.add(key)
                        _uiEvent.emit(if (response.status == "already_processed") "Purchase restored. Your credits are already in your account." else "Purchase successful! Credits added.")
                        checkSession() // Refresh user profile/balance
                    },
                    onFailure = { error ->
                        Log.w("MaddsBilling", "Purchase fulfillment deferred")
                        _uiEvent.emit("Couldn't confirm your purchase yet. Reopen the app to retry; your purchase won't be charged again.")
                    }
                )
                } finally { _isPurchaseLoading.value = false }
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

    suspend fun resetPassword(token: String, newPassword: String): Result<String> =
        authRepository.resetPassword(token, newPassword).fold(
            onSuccess = {
                _passwordResetEmailState.value = PasswordResetEmailState.Idle
                _passwordSetupState.value = PasswordSetupState.Idle
                _authState.value = AuthState.Unauthenticated
                Result.success(it)
            },
            onFailure = { Result.failure(Exception(mapError(it.message))) }
        )

    fun deleteAccount(password: String) {
        val user = (_authState.value as? AuthState.Authenticated)?.user ?: return
        if (!user.hasPassword || password.isBlank() || _isDeletingAccount.value) return
        _isDeletingAccount.value = true
        viewModelScope.launch {
            try {
                val result = authRepository.deleteAccount(password)
                if ((_authState.value as? AuthState.Authenticated)?.user?.id != user.id) return@launch
                result.fold(
                    onSuccess = {
                        _authState.value = AuthState.Unauthenticated
                        _uiEvent.emit("Account scheduled for deletion on $it. You have 30 days to cancel.")
                    },
                    onFailure = { _uiEvent.emit(mapError(it.message)) }
                )
            } finally { _isDeletingAccount.value = false }
        }
    }

    fun requestSettingsPasswordReset() {
        if (_passwordResetEmailState.value is PasswordResetEmailState.Sending) return
        val user = (_authState.value as? AuthState.Authenticated)?.user ?: return
        if (!user.hasPassword) {
            _passwordResetEmailState.value = PasswordResetEmailState.PasswordRequired
            return
        }
        _passwordResetEmailState.value = PasswordResetEmailState.Sending
        viewModelScope.launch {
            val result = authRepository.forgotPassword(user.email)
            if ((_authState.value as? AuthState.Authenticated)?.user?.id != user.id) {
                return@launch
            }
            _passwordResetEmailState.value = result.fold(
                onSuccess = { PasswordResetEmailState.Sent(it) },
                onFailure = { PasswordResetEmailState.Error(mapError(it.message)) }
            )
        }
    }

    fun clearSettingsPasswordResetState() {
        if (_passwordResetEmailState.value !is PasswordResetEmailState.Sending) {
            _passwordResetEmailState.value = PasswordResetEmailState.Idle
        }
    }

    fun requestGooglePasswordSetup(password: String, confirmPassword: String) {
        val user = (_authState.value as? AuthState.Authenticated)?.user ?: return
        if (!user.hasGoogleLogin || user.hasPassword || _passwordSetupState.value is PasswordSetupState.Sending ||
            _passwordSetupState.value is PasswordSetupState.Verifying) return
        if (!com.itsdhruvbhardwaj.picme.utils.ValidationUtils.isStrongPassword(password) || password != confirmPassword) {
            _passwordSetupState.value = PasswordSetupState.Error("Use a strong password and make sure both passwords match.")
            return
        }
        _passwordSetupState.value = PasswordSetupState.Sending
        viewModelScope.launch {
            val result = authRepository.requestGooglePasswordSetup(password, confirmPassword)
            if ((_authState.value as? AuthState.Authenticated)?.user?.id != user.id) return@launch
            result.fold(
                onSuccess = { _passwordSetupState.value = PasswordSetupState.EmailSent("Open the verification link sent to ${user.email} to finish creating your password.") },
                onFailure = { _passwordSetupState.value = PasswordSetupState.Error(mapError(it.message)) }
            )
        }
    }

    fun verifyGooglePasswordSetup(token: String) {
        if (token == verifiedSetupToken) { _passwordSetupState.value = PasswordSetupState.Verified; return }
        if (token.isBlank() || token == verifyingSetupToken) return
        verifyingSetupToken = token
        _passwordSetupState.value = PasswordSetupState.Verifying
        viewModelScope.launch {
            try {
                authRepository.verifyGooglePasswordSetup(token).fold(
                    onSuccess = {
                        verifiedSetupToken = token
                        val signedInId = (_authState.value as? AuthState.Authenticated)?.user?.id
                        if (signedInId != null) {
                            authRepository.getCurrentUser().onSuccess { user ->
                                if ((_authState.value as? AuthState.Authenticated)?.user?.id == signedInId) {
                                    _authState.value = AuthState.Authenticated(user)
                                }
                            }
                        }
                        _passwordSetupState.value = PasswordSetupState.Verified
                    },
                    onFailure = { _passwordSetupState.value = PasswordSetupState.Error(mapError(it.message)) }
                )
            } finally { verifyingSetupToken = null }
        }
    }

    fun refreshGooglePasswordSetupStatus() {
        val userId = (_authState.value as? AuthState.Authenticated)?.user?.id ?: return
        if (_passwordSetupState.value is PasswordSetupState.Sending || _passwordSetupState.value is PasswordSetupState.Verifying) return
        _passwordSetupState.value = PasswordSetupState.Verifying
        viewModelScope.launch {
            val result = authRepository.getCurrentUser()
            if ((_authState.value as? AuthState.Authenticated)?.user?.id != userId) return@launch
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
        if (_passwordSetupState.value !is PasswordSetupState.Sending && _passwordSetupState.value !is PasswordSetupState.Verifying) {
            _passwordSetupState.value = PasswordSetupState.Idle
        }
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
        if (_authState.value is AuthState.Authenticating || _authState.value is AuthState.Authenticated) return
        _authState.value = AuthState.Authenticating
        viewModelScope.launch {
            android.util.Log.i("MaddsGoogleSignIn", "BACKEND_SIGN_IN_STARTED")
            val result = kotlinx.coroutines.withTimeoutOrNull(45_000) { authRepository.googleAuth(idToken) }
                ?: Result.failure(Exception("timeout"))
            val failure = result.exceptionOrNull()?.message
            val diagnostic = when {
                result.isSuccess -> "SUCCESS"
                failure in setOf("timeout", "network_failure", "google_authentication_failed", "rate_limited", "invalid_credentials") -> failure
                failure?.startsWith("deletion_pending") == true -> "DELETION_PENDING"
                else -> "OTHER_FAILURE"
            }
            android.util.Log.i("MaddsGoogleSignIn", "BACKEND_SIGN_IN_RESULT kind=$diagnostic")
            handleAuthResult(result, googleIdToken = idToken)
        }
    }

    fun googleSignInFailed(message: String) {
        if (_authState.value !is AuthState.Authenticated && _authState.value !is AuthState.Authenticating) {
            _authState.value = AuthState.Error(message)
        }
    }

    fun logout() {
        _passwordResetEmailState.value = PasswordResetEmailState.Idle
        _passwordSetupState.value = PasswordSetupState.Idle
        _authState.value = AuthState.Unauthenticated
        viewModelScope.launch { authRepository.logout() }
    }

    fun logoutAll() {
        _passwordResetEmailState.value = PasswordResetEmailState.Idle
        _passwordSetupState.value = PasswordSetupState.Idle
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
                    _authState.value = AuthState.Error(
                        if (googleIdToken != null) GoogleSignInErrors.backendMessage(message) else mapError(message)
                    )
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
        _passwordResetEmailState.value = PasswordResetEmailState.Idle
        _passwordSetupState.value = PasswordSetupState.Idle
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
