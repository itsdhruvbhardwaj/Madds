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
    private val appContext = context.applicationContext
    private val pushState = com.itsdhruvbhardwaj.picme.notifications.PushLocalState(context.applicationContext)

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

    fun pendingGenerationKeys(userId: String): Set<String> =
        sharedPreferences.getStringSet("generation_pending_$userId", emptySet())?.toSet() ?: emptySet()

    // Commit before network submission so process death cannot erase request identity.
    fun savePendingGenerationKeys(userId: String, keys: Set<String>): Boolean =
        sharedPreferences.edit().putStringSet("generation_pending_$userId", keys).commit()

    companion object {
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_USER_CACHE = "user_cache"
    }

    /**
     * Saves both access and refresh tokens.
     */
    fun saveTokens(accessToken: String, refreshToken: String) = storeTokens(accessToken, refreshToken, false)

    fun saveRefreshedTokens(accessToken: String, refreshToken: String) = storeTokens(accessToken, refreshToken, true)

    private fun storeTokens(accessToken: String, refreshToken: String, fromRefresh: Boolean) {
      synchronized(com.itsdhruvbhardwaj.picme.notifications.PushLocalState.lock) {
        val previous = com.itsdhruvbhardwaj.picme.notifications.PushSession.fromToken(getAccessToken())
        val next = com.itsdhruvbhardwaj.picme.notifications.PushSession.fromToken(accessToken)
        val changed = previous != next
        if (changed) {
            if (fromRefresh && previous != null && next != null && previous.userId == next.userId) pushState.rotateSession(previous, next)
            else pushState.invalidateAccount()
        }
        sharedPreferences.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .putString(KEY_REFRESH_TOKEN, refreshToken)
            .apply()
        if (changed) com.itsdhruvbhardwaj.picme.notifications.PushSyncWorker.enqueue(appContext)
      }
    }

    /**
     * Updates only the access token.
     */
    fun saveAccessToken(accessToken: String) {
      synchronized(com.itsdhruvbhardwaj.picme.notifications.PushLocalState.lock) {
        val changed = com.itsdhruvbhardwaj.picme.notifications.PushSession.fromToken(getAccessToken()) !=
            com.itsdhruvbhardwaj.picme.notifications.PushSession.fromToken(accessToken)
        if (changed) pushState.invalidateAccount()
        sharedPreferences.edit()
            .putString(KEY_ACCESS_TOKEN, accessToken)
            .apply()
        if (changed) com.itsdhruvbhardwaj.picme.notifications.PushSyncWorker.enqueue(appContext)
      }
    }

    /**
     * Caches the user profile data.
     */
    fun saveUser(user: User) {
      synchronized(com.itsdhruvbhardwaj.picme.notifications.PushLocalState.lock) {
        if (getUser()?.id != user.id) pushState.invalidateAccount()
        val json = gson.toJson(user)
        sharedPreferences.edit()
            .putString(KEY_USER_CACHE, json)
            .apply()
      }
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
      synchronized(com.itsdhruvbhardwaj.picme.notifications.PushLocalState.lock) {
        pushState.invalidateAccount()
        sharedPreferences.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_USER_CACHE)
            .apply()
      }
    }
}
