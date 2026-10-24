package com.itsdhruvbhardwaj.picme.data.model

/**
 * Data model representing a PicMe user.
 *
 * @property id Unique identifier for the user.
 * @property name User's full name.
 * @property email User's email address.
 * @property emailVerified Whether the user has verified their email.
 * @property isActive Whether the account is active.
 * @property profileImage URL to the user's profile picture.
 * @property credits Number of generation credits available in the user's account.
 */
data class User(
    val id: String,
    val name: String,
    val email: String,
    val emailVerified: Boolean,
    val isActive: Boolean = true,
    val profileImage: String? = null,
    val credits: Int = 0,
    val hasPassword: Boolean = false,
    val hasGoogleLogin: Boolean = false
)
