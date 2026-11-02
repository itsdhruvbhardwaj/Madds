package com.itsdhruvbhardwaj.picme.notifications

import android.content.Context
import com.google.gson.annotations.SerializedName
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Authenticator
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.Response
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class PushPreferencesResponse(@SerializedName("preferences") val preferences: Map<String, Boolean>? = null)

class PushPreferencesRepository(context: Context, retrofit: Retrofit,
    private val storage: AuthTokenStorage, private val authRepository: AuthRepository) {
    companion object { private val requestLock = Mutex() }
    private val state = PushLocalState(context.applicationContext)
    private val appContext = context.applicationContext
    private val api = retrofit.newBuilder().client((retrofit.callFactory() as OkHttpClient).newBuilder()
        .authenticator(Authenticator.NONE).build()).build().create(PushDeviceApi::class.java)

    fun cached(userId: String) = state.preferences(userId)

    suspend fun load(userId: String): Result<Map<String, Boolean>> = execute(userId) { auth ->
        val pending = state.pendingOff(userId)
        if (pending.isNotEmpty()) api.updatePreferences(auth, pending)
        else if (PushNotifications.permissionGranted(appContext)) api.initializePreferences(auth)
        else api.preferences(auth)
    }

    suspend fun set(userId: String, category: PushCategory, enabled: Boolean): Result<Map<String, Boolean>> = withContext(Dispatchers.IO) {
      try {
        // Turning off applies locally even if the network is down.
        synchronized(PushLocalState.lock) {
            if (!enabled && storage.getUser()?.id == userId && PushSession.fromToken(storage.getAccessToken())?.userId == userId) {
                state.queueOff(userId, category.key)
                state.setPreferences(userId, cached(userId) + (category.key to false))
            }
        }
        execute(userId, setOf(category.key)) { auth -> api.updatePreferences(auth, state.pendingOff(userId) + (category.key to enabled)) }
      } catch (cancelled: CancellationException) { throw cancelled }
      catch (_: Exception) { Result.failure(Exception("Couldn't save your choice. Please try again.")) }
    }

    private suspend fun execute(userId: String, explicitlyChanged: Set<String> = emptySet(), call: suspend (String) -> Response<PushPreferencesResponse>): Result<Map<String, Boolean>> = withContext(Dispatchers.IO) { requestLock.withLock {
        try {
            val token = storage.getAccessToken() ?: error("Please sign in again.")
            val session = PushSession.fromToken(token) ?: error("Please sign in again.")
            if (session.userId != userId || storage.getUser()?.id != userId) error("Account changed. Please reopen notification settings.")
            var response = call("Bearer $token")
            if (response.code() == 401 && authRepository.refreshSession(token).isSuccess &&
                PushSession.fromToken(storage.getAccessToken())?.userId == userId && storage.getUser()?.id == userId) {
                response = call("Bearer ${storage.getAccessToken()}")
            }
            if (PushSession.fromToken(storage.getAccessToken())?.userId != userId || storage.getUser()?.id != userId) error("Account changed. Please reopen notification settings.")
            if (!response.isSuccessful) error(if (response.code() == 401) "Please sign in again." else "Couldn't sync notification preferences. Please try again.")
            val body = response.body()?.preferences ?: error("Couldn't load notification preferences.")
            val values = PushCategory.entries.associate { it.key to (body[it.key] == true) }
            synchronized(PushLocalState.lock) {
                if (PushSession.fromToken(storage.getAccessToken())?.userId != userId || storage.getUser()?.id != userId) error("Account changed.")
                state.acknowledgePreferences(userId, values, explicitlyChanged)
            }
            Result.success(state.preferences(userId))
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) { Result.failure(Exception(error.message?.takeIf { error is IllegalStateException } ?: "Couldn't connect. Check your connection and try again.")) }
    } }
}
