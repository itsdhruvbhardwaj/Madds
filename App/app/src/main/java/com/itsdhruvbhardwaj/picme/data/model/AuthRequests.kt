package com.itsdhruvbhardwaj.picme.data.model

data class RegisterRequest(
    val name: String,
    val email: String,
    val password: String
)

data class LoginRequest(
    val email: String,
    val password: String
)

data class GoogleAuthRequest(
    val idToken: String
)

data class RefreshTokenRequest(
    val refreshToken: String
)

data class ResendVerificationRequest(
    val email: String
)

data class VerifyEmailRequest(
    val token: String
)

data class ForgotPasswordRequest(
    val email: String
)

data class ResetPasswordRequest(
    val token: String,
    val newPassword: String
)

data class DeleteAccountRequest(val password: String)

data class GooglePasswordSetupRequest(
    val password: String,
    val confirmPassword: String
)

data class CancelDeletionRequest(
    val email: String? = null,
    val password: String? = null,
    val idToken: String? = null
)
