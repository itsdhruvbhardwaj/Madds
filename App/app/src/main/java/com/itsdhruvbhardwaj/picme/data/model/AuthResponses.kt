package com.itsdhruvbhardwaj.picme.data.model

data class AuthResponse(
    val ok: Boolean,
    val accessToken: String?,
    val refreshToken: String?,
    val user: User?
)

data class RegistrationResponse(
    val ok: Boolean,
    val user: User?,
    val message: String?
)

data class RefreshResponse(
    val ok: Boolean,
    val accessToken: String?,
    val refreshToken: String?
)

data class UserResponse(
    val ok: Boolean,
    val user: User
)

data class MessageResponse(
    val ok: Boolean,
    val message: String
)

data class ErrorResponse(
    val ok: Boolean,
    val message: String
)

/**
 * Response for HTTP 402 Insufficient Credits.
 */
data class InsufficientCreditsResponse(
    val ok: Boolean,
    val code: String,
    val error: String,
    val requiredCredits: Int,
    val availableCredits: Int
)
