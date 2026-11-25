package com.itsdhruvbhardwaj.picme.notifications

import android.content.Context
import com.google.gson.annotations.SerializedName
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.distinctUntilChanged
import okhttp3.Authenticator
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.Response
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class PushPreferencesResponse(@SerializedName("preferences") val preferences: Map<String, Boolean>? = null)

class PushPreferencesRepository(context: Context, retrofit: Retrofit,
    private val storage: AuthTokenStorage, private val authRepository: AuthRepository,
    private val permissionGranted: () -> Boolean = { PushNotifications.permissionGranted(context.applicationContext) }) {
    companion object { private val requestLock = Mutex() }
    private val state = PushLocalState(context.applicationContext)
    private val api = retrofit.newBuilder().client((retrofit.callFactory() as OkHttpClient).newBuilder()
        .authenticator(Authenticator.NONE).build()).build().create(PushDeviceApi::class.java)

    fun cached(userId: String) = state.preferences(userId)
    fun observe(userId: String): Flow<Map<String, Boolean>> = PushLocalState.preferenceChanges
        .map { cached(userId) }.distinctUntilChanged()

    suspend fun load(userId: String): Result<Map<String, Boolean>> = execute(userId) { auth ->
        val pending = state.pendingOff(userId)
        if (pending.isNotEmpty()) api.updatePreferences(auth, pending)
        else if (permissionGranted()) api.initializePreferences(auth)
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
            fun checkAccount() {
                if (PushSession.fromToken(storage.getAccessToken())?.userId != userId || storage.getUser()?.id != userId)
                    error("Account changed. Please reopen notification settings.")
            }
            suspend fun request(operation: suspend (String) -> Response<PushPreferencesResponse>): Map<String, Boolean> {
                checkAccount()
                val token = storage.getAccessToken() ?: error("Please sign in again.")
                var response = operation("Bearer $token")
                if (response.code() == 401 && authRepository.refreshSession(token).isSuccess) {
                    checkAccount()
                    response = operation("Bearer ${storage.getAccessToken()}")
                }
                checkAccount()
                if (!response.isSuccessful) error(if (response.code() == 401) "Please sign in again." else "Couldn't sync notification preferences. Please try again.")
                val body = response.body()?.preferences ?: error("Couldn't load notification preferences.")
                return PushCategory.entries.associate { it.key to (body[it.key] == true) }
            }
            checkAccount()
            val grant = state.pendingPermissionGrant(userId)
            if (grant != null) {
                val granted = request { auth -> api.permissionGrant(auth, mapOf("installationId" to grant)) }
                synchronized(PushLocalState.lock) {
                    checkAccount()
                    state.acknowledgePreferences(userId, granted)
                    state.acknowledgePermissionGrant(userId, grant)
                }
            }
            // Apply switches changed AFTER Allow only after its one-time reset.
            val values = request(call)
            synchronized(PushLocalState.lock) {
                checkAccount()
                state.acknowledgePreferences(userId, values, explicitlyChanged)
            }
            Result.success(state.preferences(userId))
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) { Result.failure(Exception(error.message?.takeIf { error is IllegalStateException } ?: "Couldn't connect. Check your connection and try again.")) }
    } }
}
