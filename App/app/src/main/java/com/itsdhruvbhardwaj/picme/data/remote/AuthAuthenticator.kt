package com.itsdhruvbhardwaj.picme.data.remote

import android.util.Log
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/**
 * OkHttp Authenticator that automatically refreshes the access token when a 401 Unauthorized
 * response is received. Retries the original request at most once with the new token.
 */
class AuthAuthenticator(
    private val tokenStorage: AuthTokenStorage,
    private val authRepositoryProvider: () -> AuthRepository
) : Authenticator {

    override fun authenticate(route: Route?, response: Response): Request? {
        // If the request has already been retried once, don't try again to avoid infinite loops
        if (response.responseCount >= 2) {
            Log.w("MaddsAuth", "authenticated request still returned 401 after refresh retry; stopping retry")
            return null
        }

        Log.i("MaddsAuth", "authenticated request returned 401; attempting session refresh")
        // We use runBlocking here because Authenticator is called from OkHttp's background thread
        val result = runBlocking {
            authRepositoryProvider().refreshSession()
        }

        return if (result.isSuccess) {
            val newAccessToken = tokenStorage.getAccessToken()
            if (newAccessToken != null) {
                Log.i("MaddsAuth", "retrying authenticated request with refreshed session")
                // Return the original request with the new access token
                response.request.newBuilder()
                    .header("Authorization", "Bearer $newAccessToken")
                    .build()
            } else {
                Log.w("MaddsAuth", "refresh reported success but no access token is stored; request not retried")
                null
            }
        } else {
            Log.w("MaddsAuth", "session refresh failed; request not retried")
            // If refresh fails definitively, we return null so OkHttp returns the original 401
            null
        }
    }

    private val Response.responseCount: Int
        get() {
            var result = 1
            var prevResponse = priorResponse
            while (prevResponse != null) {
                result++
                prevResponse = prevResponse.priorResponse
            }
            return result
        }
}
