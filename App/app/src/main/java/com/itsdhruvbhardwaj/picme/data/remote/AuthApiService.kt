package com.itsdhruvbhardwaj.picme.data.remote

import com.itsdhruvbhardwaj.picme.data.model.*
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Query
import retrofit2.http.PATCH
import retrofit2.http.Multipart
import retrofit2.http.Part
import okhttp3.MultipartBody

interface AuthApiService {
    @POST("api/feedback")
    suspend fun sendFeedback(@Header("Authorization") authorization: String, @Body request: FeedbackRequest): Response<FeedbackResponse>

    @PATCH("api/profile/appearance")
    suspend fun updateProfileAppearance(
        @Header("Authorization") authorization: String,
        @Body request: ProfileAppearanceRequest
    ): Response<UserResponse>

    @Multipart
    @POST("api/profile/photo")
    suspend fun uploadProfilePhoto(
        @Header("Authorization") authorization: String,
        @Part image: MultipartBody.Part
    ): Response<UserResponse>

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

    @POST("api/auth/google/password/setup")
    suspend fun requestGooglePasswordSetup(
        @Header("Authorization") authorization: String,
        @Body request: GooglePasswordSetupRequest
    ): Response<MessageResponse>

    @GET("api/auth/google/password/verify")
    suspend fun verifyGooglePasswordSetup(
        @Query("token") token: String
    ): Response<MessageResponse>

    @POST("api/auth/login/cancel-deletion")
    suspend fun cancelDeletion(
        @Body request: CancelDeletionRequest
    ): Response<AuthResponse>

    /**
     * Requests a one-time ticket for a rewarded ad attempt.
     * The ticket should be passed to AdMob SSV custom data.
     */
    @GET("api/rewarded-ads/config")
    suspend fun rewardedAdConfig(): Response<RewardedAdConfigResponse>

    @POST("api/rewarded-ads/attempts")
    suspend fun requestRewardAttempt(
        @Header("Authorization") authorization: String
    ): Response<RewardAttemptResponse>

    /**
     * Verifies a Google Play purchase and grants credits.
     */
    @POST("api/purchases/google-play/verify")
    suspend fun verifyPurchase(
        @Header("Authorization") authorization: String,
        @Body request: GooglePlayPurchaseRequest
    ): Response<PurchaseVerificationResponse>

    @GET("api/me/purchases")
    suspend fun getPurchases(@Header("Authorization") authorization: String, @Query("page") page: Int = 1, @Query("limit") limit: Int = 20): Response<PurchaseHistoryResponse>

    @GET("api/me/credit-history")
    suspend fun getCreditHistory(@Header("Authorization") authorization: String, @Query("page") page: Int = 1, @Query("limit") limit: Int = 20): Response<CreditHistoryResponse>
}
