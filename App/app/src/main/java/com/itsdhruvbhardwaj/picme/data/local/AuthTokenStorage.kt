package com.itsdhruvbhardwaj.picme.data.local

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.itsdhruvbhardwaj.picme.data.model.User

/**
 * Secure local storage for authentication tokens and user profile cache.
 * Uses EncryptedSharedPreferences backed by the Android Keystore system.
 */
class AuthTokenStorage(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val sharedPreferences = EncryptedSharedPreferences.create(
        context,
        "picme_secure_auth_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val gson = Gson()

    companion object {
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_USER_CACHE = "user_cache"
    }

    /**
     * Saves both access and refresh tokens.
     */
    fun saveTokens(accessToken: String, refreshToken: String) {
        sharedPreferences.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .apply()
    }

    /**
     * Updates only the access token.
     */
    fun saveAccessToken(accessToken: String) {
        sharedPreferences.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .apply()
    }

    /**
     * Caches the user profile data.
     */
    fun saveUser(user: User) {
        val json = gson.toJson(user)
        sharedPreferences.edit()
            .putString(KEY_USER_CACHE, json)
            .apply()
    }

    /**
     * Retrieves the cached user profile.
     */
    fun getUser(): User? {
        val json = sharedPreferences.getString(KEY_USER_CACHE, null) ?: return null
        return try {
            gson.fromJson(json, User::class.java)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Retrieves the stored access token. Returns null if not found.
     */
    fun getAccessToken(): String? {
        return sharedPreferences.getString(KEY_ACCESS_TOKEN, null)
    }

    /**
     * Retrieves the stored refresh token. Returns null if not found.
     */
    fun getRefreshToken(): String? {
        return sharedPreferences.getString(KEY_REFRESH_TOKEN, null)
    }

    /**
     * Checks if a refresh token is present.
     */
    fun hasRefreshToken(): Boolean {
        return !sharedPreferences.getString(KEY_REFRESH_TOKEN, null).isNullOrEmpty()
    }

    /**
     * Removes all authentication tokens and cached user data.
     */
    fun clearTokens() {
        sharedPreferences.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_USER_CACHE)
            .apply()
    }
}
