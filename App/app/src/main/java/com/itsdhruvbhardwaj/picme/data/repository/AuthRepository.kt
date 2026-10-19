package com.itsdhruvbhardwaj.picme.data.repository

import com.google.gson.Gson
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.*
import com.itsdhruvbhardwaj.picme.data.remote.AuthApiService
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.Response
import java.io.IOException
import java.net.SocketTimeoutException

/**
 * Repository responsible for managing authenticated sessions for PicMe.
 * Orchestrates calls between [AuthApiService] and [AuthTokenStorage].
 */
class AuthRepository(
    private val apiService: AuthApiService,
    private val tokenStorage: AuthTokenStorage
) {
    private val refreshMutex = Mutex()

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

    /**
     * Synchronized refresh operation to prevent concurrent refresh-token rotation conflicts.
     * Uses retry logic to handle Render cold starts.
     */
    suspend fun refreshSession(): Result<Unit> {
        val initialRefreshToken = tokenStorage.getRefreshToken()
            ?: return Result.failure(Exception("No refresh token available"))

        return refreshMutex.withLock {
            val currentRefreshToken = tokenStorage.getRefreshToken()
            if (currentRefreshToken != initialRefreshToken && !currentRefreshToken.isNullOrEmpty()) {
                return Result.success(Unit)
            }

            retryIO {
                try {
                    val response = apiService.refreshToken(RefreshTokenRequest(initialRefreshToken))
                    if (response.isSuccessful && response.body()?.ok == true) {
                        val body = response.body()!!
                        val newAccessToken = body.accessToken
                        val newRefreshToken = body.refreshToken
                        if (newAccessToken != null && newRefreshToken != null) {
                            tokenStorage.saveTokens(newAccessToken, newRefreshToken)
                            Result.success(Unit)
                        } else {
                            Result.failure(Exception("refresh_failed"))
                        }
                    } else {
                        val code = response.code()
                        if (code == 401 || code == 403) {
                            tokenStorage.clearTokens()
                            Result.failure(Exception("session_expired"))
                        } else {
                            Result.failure(Exception("refresh_failed"))
                        }
                    }
                } catch (e: SocketTimeoutException) {
                    Result.failure(Exception("timeout"))
                } catch (e: IOException) {
                    Result.failure(Exception("network_failure"))
                } catch (e: Exception) {
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
                    tokenStorage.saveUser(response.user)
                    Result.success(response.user)
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
            } catch (e: Exception) {
                // Ignore
            }
        }

        return Result.success(Unit)
    }

    /**
     * Requests a reward attempt ticket from the backend.
     */
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
                } catch (e: Exception) {
                    null
                }

                val serverMessage = errorResponse?.message ?: errorBodyString
                
                val mappedMessage = when {
                    errorCode == 409 || serverMessage.contains("already exists", ignoreCase = true) || serverMessage.contains("already taken", ignoreCase = true) -> "email_already_exists"
                    serverMessage.contains("verify your email", ignoreCase = true) -> "unverified_account"
                    serverMessage.contains("invalid", ignoreCase = true) && serverMessage.contains("token", ignoreCase = true) -> "invalid_token"
                    serverMessage.contains("expired", ignoreCase = true) -> "expired_token"
                    serverMessage.contains("already been used", ignoreCase = true) -> "token_already_used"
                    errorCode == 401 -> "invalid_credentials"
                    errorCode == 403 -> "forbidden"
                    errorCode >= 500 -> "server_failure ($errorCode)"
                    else -> if (serverMessage.isNotEmpty()) "$serverMessage ($errorCode)" else "server_failure ($errorCode)"
                }
                Result.failure(Exception(mappedMessage))
            }
        } catch (e: SocketTimeoutException) {
            Result.failure(Exception("timeout"))
        } catch (e: IOException) {
            Result.failure(Exception("network_failure"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun <T> retryIO(
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
