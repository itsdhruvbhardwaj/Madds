package com.itsdhruvbhardwaj.picme.data.repository

import com.google.gson.Gson
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.*
import com.itsdhruvbhardwaj.picme.data.remote.AuthApiService
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import retrofit2.Response
import java.io.IOException

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
     * If multiple calls occur simultaneously, they queue and the subsequent calls check if
     * a new token was already obtained by the first call.
     */
    suspend fun refreshSession(): Result<Unit> {
        val initialRefreshToken = tokenStorage.getRefreshToken()
            ?: return Result.failure(Exception("No refresh token available"))

        refreshMutex.withLock {
            // Check if another thread already rotated the tokens while we were waiting for the lock
            val currentRefreshToken = tokenStorage.getRefreshToken()
            if (currentRefreshToken != initialRefreshToken && !currentRefreshToken.isNullOrEmpty()) {
                return Result.success(Unit)
            }

            return try {
                val response = apiService.refreshToken(RefreshTokenRequest(initialRefreshToken))
                if (response.isSuccessful && response.body()?.ok == true) {
                    val newAccessToken = response.body()?.accessToken
                    val newRefreshToken = response.body()?.refreshToken
                    if (newAccessToken != null && newRefreshToken != null) {
                        tokenStorage.saveTokens(newAccessToken, newRefreshToken)
                        Result.success(Unit)
                    } else {
                        Result.failure(Exception("Failed to rotate tokens"))
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
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    suspend fun getCurrentUser(): Result<User> {
        val accessToken = tokenStorage.getAccessToken()
            ?: return Result.failure(Exception("No access token available"))

        return safeApiCall(
            call = { apiService.getCurrentUser("Bearer $accessToken") },
            onSuccess = { response ->
                tokenStorage.saveUser(response.user)
                Result.success(response.user)
            }
        )
    }

    fun getCachedUser(): User? {
        return tokenStorage.getUser()
    }

    suspend fun logout(): Result<Unit> {
        val accessToken = tokenStorage.getAccessToken()
        
        if (accessToken != null) {
            try {
                apiService.logout("Bearer $accessToken")
            } catch (e: Exception) {
                // Ignore
            }
        }

        tokenStorage.clearTokens()
        return Result.success(Unit)
    }

    suspend fun logoutAll(): Result<Unit> {
        val accessToken = tokenStorage.getAccessToken()

        if (accessToken != null) {
            try {
                apiService.logoutAll("Bearer $accessToken")
            } catch (e: Exception) {
                // Ignore
            }
        }

        tokenStorage.clearTokens()
        return Result.success(Unit)
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
                
                // Attempt to parse structured error response
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
                    errorCode >= 500 -> "server_failure"
                    else -> "server_failure"
                }
                Result.failure(Exception(mappedMessage))
            }
        } catch (e: IOException) {
            Result.failure(Exception("network_failure"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
