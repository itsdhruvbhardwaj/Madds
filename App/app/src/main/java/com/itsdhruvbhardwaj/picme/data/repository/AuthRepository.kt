package com.itsdhruvbhardwaj.picme.data.repository

import android.util.Log
import com.google.gson.Gson
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.*
import com.itsdhruvbhardwaj.picme.data.remote.AuthApiService
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.delay
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.Response
import java.io.IOException
import java.net.SocketTimeoutException
import okhttp3.MultipartBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Repository responsible for managing authenticated sessions for PicMe.
 * Orchestrates calls between [AuthApiService] and [AuthTokenStorage].
 */
class AuthRepository(
    private val apiService: AuthApiService,
    private val tokenStorage: AuthTokenStorage,
    private val refreshApiService: AuthApiService = apiService,
    private val engagementStore: com.itsdhruvbhardwaj.picme.data.local.EngagementStore? = null
) {
    private companion object {
        const val AUTH_LOG_TAG = "MaddsAuth"
        // MainActivity and background registration workers must share one refresh lock.
        val refreshMutex = Mutex()
    }

    suspend fun completeStylePreferenceSetup(preference: String): Result<User> {
        val token = tokenStorage.getAccessToken() ?: return Result.failure(Exception("session_expired"))
        return safeApiCall(
            call = { apiService.completeStylePreferenceSetup("Bearer $token", com.itsdhruvbhardwaj.picme.data.remote.StylePreferenceResponse(preference)) },
            onSuccess = { response ->
                if (response.user.stylePreferenceSetupComplete != true) Result.failure(Exception("Couldn't save your preference. Please try again."))
                else cacheUpdatedProfile(response.user)
            }
        )
    }

    suspend fun updateProfileAppearance(request: ProfileAppearanceRequest): Result<User> {
        val token = tokenStorage.getAccessToken() ?: return Result.failure(Exception("session_expired"))
        return safeApiCall(
            call = { apiService.updateProfileAppearance("Bearer $token", request) },
            onSuccess = { response -> cacheUpdatedProfile(response.user) }
        )
    }

    suspend fun uploadProfilePhoto(jpeg: ByteArray): Result<User> {
        val token = tokenStorage.getAccessToken() ?: return Result.failure(Exception("session_expired"))
        val part = MultipartBody.Part.createFormData("image", "profile.jpg", jpeg.toRequestBody("image/jpeg".toMediaType()))
        return safeApiCall(
            call = { apiService.uploadProfilePhoto("Bearer $token", part) },
            onSuccess = { response -> cacheUpdatedProfile(response.user) }
        )
    }

    private fun cacheUpdatedProfile(user: User): Result<User> {
        if (tokenStorage.getUser()?.id != user.id) return Result.failure(Exception("Account changed. Please try again."))
        val effective = preserveCompletedStyleSetup(user)
        tokenStorage.saveUser(effective)
        return Result.success(effective)
    }

    private fun preserveCompletedStyleSetup(user: User): User {
        val cached = tokenStorage.getUser()
        return if (cached?.id == user.id && cached.stylePreferenceSetupComplete == true)
            user.copy(stylePreferenceSetupComplete = true) else user
    }

    suspend fun login(email: String, password: String): Result<User> {
        return safeApiCall(
            call = { apiService.login(LoginRequest(email, password)) },
            onSuccess = { response ->
                val user = response.user
                val accessToken = response.accessToken
                val refreshToken = response.refreshToken

                if (user != null && accessToken != null && refreshToken != null) {
                    tokenStorage.saveTokens(accessToken, refreshToken)
                    tokenStorage.saveUser(user)
                    Result.success(user)
                } else if (response.deletionScheduledAt != null) {
                    Result.failure(Exception("deletion_pending|${response.deletionScheduledAt}"))
                } else {
                    Result.failure(Exception("server_failure"))
                }
            }
        )
    }

    suspend fun register(name: String, email: String, password: String): Result<User> {
        return safeApiCall(
            call = { apiService.register(RegisterRequest(name, email, password)) },
            onSuccess = { response ->
                val user = response.user
                if (user != null) {
                    Result.success(user)
                } else {
                    Result.failure(Exception(response.message ?: "Registration failed"))
                }
            }
        )
    }

    suspend fun verifyEmail(token: String): Result<User> {
        return safeApiCall(
            call = { apiService.verifyEmail(VerifyEmailRequest(token)) },
            onSuccess = { response ->
                val user = response.user
                val accessToken = response.accessToken
                val refreshToken = response.refreshToken

                if (user != null && accessToken != null && refreshToken != null) {
                    tokenStorage.saveTokens(accessToken, refreshToken)
                    tokenStorage.saveUser(user)
                    Result.success(user)
                } else {
                    Result.failure(Exception("verification_success_no_tokens"))
                }
            }
        )
    }

    suspend fun resendVerification(email: String): Result<String> {
        return safeApiCall(
            call = { apiService.resendVerification(ResendVerificationRequest(email)) },
            onSuccess = { response ->
                Result.success(response.message)
            }
        )
    }

    suspend fun googleAuth(idToken: String): Result<User> {
        return safeApiCall(
            call = { apiService.googleAuth(GoogleAuthRequest(idToken)) },
            onSuccess = { response ->
                val user = response.user
                val accessToken = response.accessToken
                val refreshToken = response.refreshToken

                if (user != null && accessToken != null && refreshToken != null) {
                    tokenStorage.saveTokens(accessToken, refreshToken)
                    tokenStorage.saveUser(user)
                    Result.success(user)
                } else {
                    Result.failure(Exception("server_failure"))
                }
            }
        )
    }

    suspend fun forgotPassword(email: String): Result<String> {
        return safeApiCall(
            call = { apiService.forgotPassword(ForgotPasswordRequest(email)) },
            onSuccess = { response ->
                Result.success(response.message)
            }
        )
    }

    suspend fun resetPassword(token: String, newPassword: String): Result<String> {
        return safeApiCall(
            call = { apiService.resetPassword(ResetPasswordRequest(token, newPassword)) },
            onSuccess = { response ->
                if (response.ok) {
                    tokenStorage.clearTokens()
                    Result.success(response.message)
                } else Result.failure(Exception(response.message))
            }
        )
    }

    suspend fun deleteAccount(password: String): Result<String> {
        val accessToken = tokenStorage.getAccessToken() ?: return Result.failure(Exception("unauthorized"))
        return safeApiCall(
            call = { apiService.deleteAccount("Bearer $accessToken", DeleteAccountRequest(password)) },
            onSuccess = { response ->
                tokenStorage.clearTokens()
                Result.success(response.deletionScheduledAt ?: "")
            }
        )
    }

    suspend fun requestGooglePasswordSetup(password: String, confirmPassword: String): Result<String> {
        val accessToken = tokenStorage.getAccessToken()
            ?: return Result.failure(Exception("No access token available"))
        return safeApiCall(
            call = {
                apiService.requestGooglePasswordSetup(
                    "Bearer $accessToken",
                    GooglePasswordSetupRequest(password, confirmPassword)
                )
            },
            onSuccess = { response -> Result.success(response.message) }
        )
    }

    suspend fun verifyGooglePasswordSetup(token: String): Result<String> {
        return safeApiCall(
            call = { apiService.verifyGooglePasswordSetup(token) },
            onSuccess = { response -> Result.success(response.message) }
        )
    }

    suspend fun cancelDeletion(email: String, password: String): Result<User> {
        return safeApiCall(
            call = { apiService.cancelDeletion(CancelDeletionRequest(email, password)) },
            onSuccess = { response ->
                val user = response.user
                val accessToken = response.accessToken
                val refreshToken = response.refreshToken

                if (user != null && accessToken != null && refreshToken != null) {
                    tokenStorage.saveTokens(accessToken, refreshToken)
                    tokenStorage.saveUser(user)
                    Result.success(user)
                } else {
                    Result.failure(Exception("server_failure"))
                }
            }
        )
    }

    suspend fun cancelDeletionWithGoogle(idToken: String): Result<User> {
        return safeApiCall(
            call = { apiService.cancelDeletion(CancelDeletionRequest(idToken = idToken)) },
            onSuccess = { response ->
                val user = response.user
                val accessToken = response.accessToken
                val refreshToken = response.refreshToken

                if (user != null && accessToken != null && refreshToken != null) {
                    tokenStorage.saveTokens(accessToken, refreshToken)
                    tokenStorage.saveUser(user)
                    Result.success(user)
                } else {
                    Result.failure(Exception("server_failure"))
                }
            }
        )
    }

    /**
     * Synchronized refresh operation to prevent concurrent refresh-token rotation conflicts.
     * Uses retry logic to handle Render cold starts.
     */
    suspend fun refreshSession(failedAccessToken: String? = null): Result<Unit> {
        val initialRefreshToken = tokenStorage.getRefreshToken()
            ?: run {
                Log.w(AUTH_LOG_TAG, "refresh not attempted: no refresh token is stored")
                return Result.failure(Exception("No refresh token available"))
            }

        return refreshMutex.withLock {
            // A queued 401 may belong to an older access token. Reuse the new
            // session rather than rotating it again after waiting for the lock.
            if (failedAccessToken != null) {
                val latestAccessToken = tokenStorage.getAccessToken()
                if (!latestAccessToken.isNullOrEmpty() && latestAccessToken != failedAccessToken) {
                    return@withLock Result.success(Unit)
                }
            }
            val currentRefreshToken = tokenStorage.getRefreshToken()
            if (currentRefreshToken != initialRefreshToken && !currentRefreshToken.isNullOrEmpty()) {
                Log.i(AUTH_LOG_TAG, "refresh skipped: another request already rotated the session")
                return Result.success(Unit)
            }

            retryIO {
                try {
                    val response = refreshApiService.refreshToken(RefreshTokenRequest(initialRefreshToken))
                    // Logout/account switching must win over an older network response.
                    if (tokenStorage.getRefreshToken() != initialRefreshToken) {
                        return@retryIO Result.failure(Exception("session_changed"))
                    }
                    if (response.isSuccessful && response.body()?.ok == true) {
                        val body = response.body()!!
                        val newAccessToken = body.accessToken
                        val newRefreshToken = body.refreshToken
                        if (newAccessToken != null && newRefreshToken != null) {
                            val stored = synchronized(com.itsdhruvbhardwaj.picme.notifications.PushLocalState.lock) {
                                if (tokenStorage.getRefreshToken() != initialRefreshToken) false
                                else { tokenStorage.saveRefreshedTokens(newAccessToken, newRefreshToken); true }
                            }
                            if (stored) {
                                Log.i(AUTH_LOG_TAG, "refresh succeeded; rotated tokens stored")
                                Result.success(Unit)
                            } else Result.failure(Exception("session_changed"))
                        } else {
                            Log.w(AUTH_LOG_TAG, "refresh failed: successful response did not contain both tokens")
                            Result.failure(Exception("refresh_failed"))
                        }
                    } else {
                        val code = response.code()
                        if (code == 401 || code == 403) {
                            Log.w(AUTH_LOG_TAG, "refresh rejected with HTTP $code; clearing local session")
                            synchronized(com.itsdhruvbhardwaj.picme.notifications.PushLocalState.lock) {
                                if (tokenStorage.getRefreshToken() == initialRefreshToken) tokenStorage.clearTokens()
                            }
                            Result.failure(Exception("session_expired"))
                        } else {
                            Log.w(AUTH_LOG_TAG, "refresh failed with HTTP $code; local session retained")
                            Result.failure(Exception(if (code == 429) "rate_limited" else if (code >= 500) "server_failure ($code)" else "refresh_failed"))
                        }
                    }
                } catch (e: SocketTimeoutException) {
                    Log.w(AUTH_LOG_TAG, "refresh failed: network timeout")
                    Result.failure(Exception("timeout"))
                } catch (e: IOException) {
                    Log.w(AUTH_LOG_TAG, "refresh failed: network I/O error")
                    Result.failure(Exception("network_failure"))
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(AUTH_LOG_TAG, "refresh failed: unexpected ${e.javaClass.simpleName}")
                    Result.failure(e)
                }
            }
        }
    }

    suspend fun getCurrentUser(): Result<User> {
        val accessToken = tokenStorage.getAccessToken()
            ?: return Result.failure(Exception("No access token available"))

        return retryIO {
            safeApiCall(
                call = { apiService.getCurrentUser("Bearer $accessToken") },
                onSuccess = { response ->
                    // A response started before a successful password reset
                    // must not restore the profile cache after tokens are cleared.
                    if (tokenStorage.getAccessToken().isNullOrBlank()) {
                        Result.failure(Exception("session_expired"))
                    } else {
                        val user = preserveCompletedStyleSetup(response.user)
                        tokenStorage.saveUser(user)
                        Result.success(user)
                    }
                }
            )
        }
    }

    fun getCachedUser(): User? {
        return tokenStorage.getUser()
    }

    fun hasRefreshToken(): Boolean {
        return tokenStorage.hasRefreshToken()
    }

    /**
     * Clears the local session and makes a best-effort request to the backend to invalidate tokens.
     */
    suspend fun logout(): Result<Unit> {
        val accessToken = tokenStorage.getAccessToken()
        
        // 1. Clear local tokens immediately to prevent any further authenticated requests
        tokenStorage.clearTokens()

        // 2. Best-effort backend logout if we had a token
        if (accessToken != null) {
            try {
                // We don't wait for this to succeed or fail to consider logout successful locally
                apiService.logout("Bearer $accessToken")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Ignore network errors during logout
            }
        }

        return Result.success(Unit)
    }

    suspend fun logoutAll(): Result<Unit> {
        val accessToken = tokenStorage.getAccessToken()
        
        // 1. Clear local tokens immediately
        tokenStorage.clearTokens()

        if (accessToken != null) {
            try {
                apiService.logoutAll("Bearer $accessToken")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Ignore
            }
        }

        return Result.success(Unit)
    }

    /**
     * Requests a reward attempt ticket from the backend.
     */
    suspend fun getRewardedAdConfig(): Result<RewardedAdConfigResponse> = safeApiCall(
        call = { apiService.rewardedAdConfig() },
        onSuccess = { config ->
            if (config.ok && (!config.available || config.validReward)) Result.success(config)
            else Result.failure(Exception("Couldn't load the ad reward. Please try again."))
        }
    )

    suspend fun requestRewardAttempt(): Result<RewardAttemptResponse> {
        val accessToken = tokenStorage.getAccessToken()
            ?: return Result.failure(Exception("No access token available"))

        return safeApiCall(
            call = { apiService.requestRewardAttempt("Bearer $accessToken") },
            onSuccess = { response ->
                if (response.ok && !response.customData.isNullOrBlank()) {
                    Result.success(response)
                } else {
                    val errorMessage = response.message ?: response.error ?: "Failed to get reward ticket"
                    Result.failure(Exception(errorMessage))
                }
            }
        )
    }

    /**
     * Verifies a Google Play purchase with the backend.
     */
    suspend fun verifyPurchase(productId: String, purchaseToken: String, purchaseOptionId: String): Result<PurchaseVerificationResponse> {
        var accessToken = tokenStorage.getAccessToken()
            ?: return Result.failure(Exception("No access token available"))
        val userId = tokenStorage.getUser()?.id ?: return Result.failure(Exception("Sign in before verifying a purchase."))

        return safeApiCall(
            call = { 
                check(tokenStorage.getUser()?.id == userId) { "Account changed." }
                val body = GooglePlayPurchaseRequest(productId, purchaseToken, purchaseOptionId)
                // Raw client: a delayed request must never be retried as another account.
                var response = refreshApiService.verifyPurchase("Bearer $accessToken", body)
                if (response.code() == 401 && tokenStorage.getUser()?.id == userId && refreshSession(accessToken).isSuccess && tokenStorage.getUser()?.id == userId) {
                    accessToken = tokenStorage.getAccessToken() ?: error("Session expired.")
                    response = refreshApiService.verifyPurchase("Bearer $accessToken", body)
                }
                response
            },
            onSuccess = { response ->
                if (tokenStorage.getUser()?.id != userId) {
                    Result.failure(Exception("Account changed. Reopen the app to restore this purchase."))
                } else if (response.ok) {
                    Result.success(response)
                } else {
                    Result.failure(Exception(response.message))
                }
            }
        )
    }

    suspend fun claimEngagementPrompt(ownerId: String, request: EngagementClaimRequest): Result<EngagementClaimResponse> = authenticatedHistoryCall(
        call = { check(tokenStorage.getUser()?.id == ownerId) { "Account changed." }; apiService.claimEngagementPrompt(it, request) }, extract = { it })
    suspend fun respondEngagementPrompt(ownerId: String, request: EngagementResponseRequest): Result<Boolean> = authenticatedHistoryCall(
        call = { check(tokenStorage.getUser()?.id == ownerId) { "Account changed." }; apiService.respondEngagementPrompt(it, request) }, extract = { it.ok })
    suspend fun sendFeedback(request: com.itsdhruvbhardwaj.picme.data.model.FeedbackRequest): Result<Boolean> {
        val owner = tokenStorage.getUser()?.id ?: return Result.failure(Exception("session_expired"))
        return authenticatedHistoryCall(
            call = { authorization -> check(tokenStorage.getUser()?.id == owner) { "Account changed." }; apiService.sendFeedback(authorization, request) }, extract = { it.ok }
        ).also { if (it.getOrNull() == true && tokenStorage.getUser()?.id == owner) engagementStore?.feedbackSubmitted(owner) }
    }

    suspend fun getPurchases(page: Int = 1): Result<PurchaseHistoryResponse> {
        return authenticatedHistoryCall(
            call = { authorization: String -> apiService.getPurchases(authorization, page, 20) },
            extract = { response: PurchaseHistoryResponse -> response }
        )
    }

    suspend fun getCreditHistory(page: Int = 1): Result<CreditHistoryResponse> {
        return authenticatedHistoryCall(
            call = { authorization: String -> apiService.getCreditHistory(authorization, page, 20) },
            extract = { response: CreditHistoryResponse -> response }
        )
    }

    private suspend fun <T, R> authenticatedHistoryCall(
        call: suspend (String) -> Response<T>,
        extract: (T) -> R
    ): Result<R> {
        val userId = tokenStorage.getUser()?.id ?: return Result.failure(Exception("session_expired"))
        var token = tokenStorage.getAccessToken() ?: return Result.failure(Exception("session_expired"))
        return safeApiCall(
            call = {
                check(tokenStorage.getUser()?.id == userId) { "Account changed." }
                var response = call("Bearer $token")
                if (response.code() == 401 && tokenStorage.getUser()?.id == userId && refreshSession(token).isSuccess && tokenStorage.getUser()?.id == userId) {
                    token = tokenStorage.getAccessToken() ?: error("Session expired.")
                    response = call("Bearer $token")
                }
                response
            },
            onSuccess = { body ->
                if (tokenStorage.getUser()?.id != userId) Result.failure(Exception("Account changed."))
                else Result.success(extract(body))
            }
        )
    }

    /**
     * Helper to safely execute API calls and map responses to [Result].
     */
    private suspend fun <T, R> safeApiCall(
        call: suspend () -> Response<T>,
        onSuccess: (T) -> Result<R>
    ): Result<R> {
        return try {
            val response = call()
            
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    onSuccess(body)
                } else {
                    Result.failure(Exception("server_failure"))
                }
            } else {
                val errorCode = response.code()
                val errorBodyString = response.errorBody()?.string() ?: ""
                
                val errorResponse = try {
                    Gson().fromJson(errorBodyString, ErrorResponse::class.java)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    null
                }

                val serverMessage = errorResponse?.message ?: errorResponse?.error ?: errorBodyString
                val serverCode = errorResponse?.code
                
                val mappedMessage = when {
                    serverCode == "ACCOUNT_DELETION_PENDING" -> "deletion_pending|${errorResponse?.deletionScheduledAt ?: ""}"
                    serverCode == "GOOGLE_ACCOUNT_MISMATCH" -> "google_account_mismatch"
                    serverCode == "GOOGLE_AUTH_FAILED" || serverMessage.contains("Google authentication failed", ignoreCase = true) -> "google_authentication_failed"
                    errorCode == 409 || serverMessage.contains("already exists", ignoreCase = true) || serverMessage.contains("already taken", ignoreCase = true) -> "email_already_exists"
                    serverMessage.contains("verify your email", ignoreCase = true) -> "unverified_account"
                    serverMessage.contains("invalid", ignoreCase = true) && serverMessage.contains("token", ignoreCase = true) -> "invalid_token"
                    serverMessage.contains("expired", ignoreCase = true) -> "expired_token"
                    serverMessage.contains("already been used", ignoreCase = true) -> "token_already_used"
                    errorCode == 401 -> "invalid_credentials"
                    errorCode == 403 -> "forbidden"
                    errorCode == 429 -> "rate_limited"
                    errorCode >= 500 -> "server_failure ($errorCode)"
                    else -> if (serverMessage.isNotEmpty()) "$serverMessage ($errorCode)" else "server_failure ($errorCode)"
                }
                Result.failure(Exception(mappedMessage))
            }
        } catch (e: SocketTimeoutException) {
            Result.failure(Exception("timeout"))
        } catch (e: IOException) {
            Result.failure(Exception("network_failure"))
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun <T> retryIO(block: suspend () -> Result<T>): Result<T> =
        withTimeoutOrNull(35_000) { retryAttempts(block = block) }
            ?: Result.failure(Exception("timeout"))

    private suspend fun <T> retryAttempts(
        times: Int = 3,
        initialDelay: Long = 1000,
        maxDelay: Long = 5000,
        factor: Double = 2.0,
        block: suspend () -> Result<T>
    ): Result<T> {
        var currentDelay = initialDelay
        repeat(times - 1) {
            val result = block()
            val exception = result.exceptionOrNull()
            if (result.isSuccess || (exception != null && exception.message !in listOf("timeout", "network_failure", "server_failure"))) {
                return result
            }
            delay(currentDelay)
            currentDelay = (currentDelay * factor).toLong().coerceAtMost(maxDelay)
        }
        return block()
    }
}
