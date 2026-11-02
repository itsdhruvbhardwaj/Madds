package com.itsdhruvbhardwaj.picme.notifications

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.isActive
import okhttp3.Authenticator
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.HTTP
import retrofit2.http.PUT
import retrofit2.http.POST
import retrofit2.http.GET
import retrofit2.http.PATCH
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import com.google.gson.annotations.SerializedName
import java.util.UUID

// This JSON contract must be identical in debug and optimized Play builds.
data class PushDeviceRequest(
    @field:SerializedName("deviceId") val deviceId: String,
    @field:SerializedName("bindingVersion") val bindingVersion: Long,
    @field:SerializedName("fcmToken") val fcmToken: String? = null,
    @field:SerializedName("permissionGranted") val permissionGranted: Boolean = false
)

interface PushDeviceApi {
    @GET("api/notifications/preferences")
    suspend fun preferences(@Header("Authorization") auth: String): retrofit2.Response<PushPreferencesResponse>
    @PATCH("api/notifications/preferences")
    suspend fun updatePreferences(@Header("Authorization") auth: String, @Body values: Map<String, Boolean>): retrofit2.Response<PushPreferencesResponse>
    @POST("api/notifications/preferences/initialize")
    suspend fun initializePreferences(@Header("Authorization") auth: String): retrofit2.Response<PushPreferencesResponse>
    @POST("api/notifications/activity")
    suspend fun activity(@Header("Authorization") auth: String): retrofit2.Response<Unit>
    @PUT("api/notifications/device")
    suspend fun register(@Header("Authorization") auth: String, @Body body: PushDeviceRequest): retrofit2.Response<Unit>
    @HTTP(method = "DELETE", path = "api/notifications/device", hasBody = true)
    suspend fun unregister(@Header("Authorization") auth: String, @Body body: PushDeviceRequest): retrofit2.Response<Unit>
}

/** One installation, many possible accounts; all ownership is decided server-side. */
class PushDeviceSync(context: Context, retrofit: Retrofit, private val storage: AuthTokenStorage,
    private val authRepository: AuthRepository, private val categories: PushPreferencesRepository) {
    private val context = context.applicationContext
    private val localState = PushLocalState(this.context)
    // Never let an old account's request be retried using a new account's token.
    private val api = retrofit.newBuilder().client(
        retrofit.callFactory().let { it as okhttp3.OkHttpClient }.newBuilder()
            .authenticator(Authenticator.NONE).build()
    ).build().create(PushDeviceApi::class.java)
    private var previousAuthorization: String? = null

    private fun request(token: String? = null): PushDeviceRequest {
        return localState.nextRequest(token)
    }

    suspend fun syncOnce(userId: String, token: String): Boolean {
        var access = storage.getAccessToken() ?: return true
        var identity = PushSession.fromToken(access) ?: return true
        if (storage.getUser()?.id != userId || identity.userId != userId) return true
        var body = request(token)
        var response = api.register("Bearer $access", body)
        if (response.code() == 401 && authRepository.refreshSession(access).isSuccess &&
            PushSession.fromToken(storage.getAccessToken())?.userId == userId && storage.getUser()?.id == userId) {
            access = storage.getAccessToken() ?: return true
            identity = PushSession.fromToken(access) ?: return true
            body = request(token)
            response = api.register("Bearer $access", body)
        }
        if (!response.isSuccessful) return false
        if (PushSession.fromToken(storage.getAccessToken()) != identity || storage.getUser()?.id != userId) return true
        if (categories.load(userId).isFailure) return false
        if (PushSession.fromToken(storage.getAccessToken()) != identity) return false
        synchronized(PushLocalState.lock) {
            if (PushSession.fromToken(storage.getAccessToken()) == identity && storage.getUser()?.id == userId) localState.accept(identity, body.bindingVersion)
        }
        runCatching { api.activity("Bearer $access") }
        return true
    }

    suspend fun observe(auth: StateFlow<AuthState>) {
        combine(auth, PushRegistration.token) { state, token -> state to token }.collectLatest { (state, token) ->
            if (state is AuthState.Unauthenticated) {
                val previous = previousAuthorization
                previousAuthorization = null
                if (previous != null) {
                    try { api.unregister(previous, request()) }
                    catch (cancelled: CancellationException) { throw cancelled }
                    catch (_: Exception) { /* Revoked sessions are excluded by the sender as well. */ }
                }
            } else if (state is AuthState.Authenticated && token != null) {
                while (currentCoroutineContext().isActive) {
                    if (storage.getUser()?.id != state.user.id) break
                    val access = storage.getAccessToken() ?: break
                    previousAuthorization = "Bearer $access"
                    try {
                        if (syncOnce(state.user.id, token)) {
                            delay(15 * 60_000L)
                            continue
                        }
                    } catch (cancelled: CancellationException) { throw cancelled }
                    catch (_: Exception) { /* Registration never blocks authentication. */ }
                    delay(60_000L)
                }
            }
        }
    }
}
