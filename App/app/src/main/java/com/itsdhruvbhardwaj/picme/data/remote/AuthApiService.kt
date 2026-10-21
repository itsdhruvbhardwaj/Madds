package com.itsdhruvbhardwaj.picme.data.remote

import com.itsdhruvbhardwaj.picme.data.model.*
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST

interface AuthApiService {

    @POST("api/auth/register")
    suspend fun register(
        @Body request: RegisterRequest
    ): Response<RegistrationResponse>

    @POST("api/auth/verify-email")
    suspend fun verifyEmail(
        @Body request: VerifyEmailRequest
    ): Response<AuthResponse>

    @POST("api/auth/resend-verification")
    suspend fun resendVerification(
        @Body request: ResendVerificationRequest
    ): Response<MessageResponse>

    @POST("api/auth/login")
    suspend fun login(
        @Body request: LoginRequest
    ): Response<AuthResponse>

    @POST("api/auth/google")
    suspend fun googleAuth(
        @Body request: GoogleAuthRequest
    ): Response<AuthResponse>

    @POST("api/auth/refresh")
    suspend fun refreshToken(
        @Body request: RefreshTokenRequest
    ): Response<RefreshResponse>

    @GET("api/auth/me")
    suspend fun getCurrentUser(
        @Header("Authorization") authorization: String
    ): Response<UserResponse>

    @POST("api/auth/logout")
    suspend fun logout(
        @Header("Authorization") authorization: String
    ): Response<MessageResponse>

    @POST("api/auth/logout-all")
    suspend fun logoutAll(
        @Header("Authorization") authorization: String
    ): Response<MessageResponse>

    @POST("api/auth/forgot-password")
    suspend fun forgotPassword(
        @Body request: ForgotPasswordRequest
    ): Response<MessageResponse>

    @POST("api/auth/reset-password")
    suspend fun resetPassword(
        @Body request: ResetPasswordRequest
    ): Response<MessageResponse>

    @POST("api/auth/delete-account")
    suspend fun deleteAccount(
        @Header("Authorization") authorization: String,
        @Body request: DeleteAccountRequest
    ): Response<MessageResponse>

    @POST("api/auth/login/cancel-deletion")
    suspend fun cancelDeletion(
        @Body request: CancelDeletionRequest
    ): Response<AuthResponse>

    /**
     * Requests a one-time ticket for a rewarded ad attempt.
     * The ticket should be passed to AdMob SSV custom data.
     */
    @POST("api/rewarded-ads/attempts")
    suspend fun requestRewardAttempt(
        @Header("Authorization") authorization: String
    ): Response<RewardAttemptResponse>
}
