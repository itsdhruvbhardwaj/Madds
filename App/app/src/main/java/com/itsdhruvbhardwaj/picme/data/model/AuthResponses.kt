package com.itsdhruvbhardwaj.picme.data.model

data class AuthResponse(
    val ok: Boolean,
    val accessToken: String?,
    val refreshToken: String?,
    val user: User?,
    val deletionScheduledAt: String? = null
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
    val message: String,
    val deletionScheduledAt: String? = null
)

data class ErrorResponse(
    val ok: Boolean,
    val message: String? = null,
    val code: String? = null,
    val deletionScheduledAt: String? = null,
    val error: String? = null
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
