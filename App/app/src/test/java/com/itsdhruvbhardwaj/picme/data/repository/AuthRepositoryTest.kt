package com.itsdhruvbhardwaj.picme.data.repository

import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.*
import com.itsdhruvbhardwaj.picme.data.remote.AuthApiService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.mockito.Mock
import org.mockito.Mockito.`when`
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.any
import org.mockito.kotlin.never
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import retrofit2.Response

class AuthRepositoryTest {

    @Mock
    private lateinit var apiService: AuthApiService

    @Mock
    private lateinit var tokenStorage: AuthTokenStorage

    private lateinit var repository: AuthRepository

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        repository = AuthRepository(apiService, tokenStorage)
    }

    @Test
    fun `register with existing email returns email_already_exists error`() {
        runBlocking {
            val errorJson = "{\"ok\":false, \"message\":\"Email already exists\"}"
            val errorResponseBody = errorJson.toResponseBody("application/json".toMediaTypeOrNull())
            `when`(apiService.register(any())).thenReturn(Response.error(409, errorResponseBody))

            val result = repository.register("Test", "test@example.com", "Password123")

            assertTrue(result.isFailure)
            assertEquals("email_already_exists", result.exceptionOrNull()?.message)
        }
    }

    @Test
    fun `refreshSession success saves both tokens and preserves session`() {
        runBlocking {
            val refreshToken = "old_refresh_token"
            val newAccessToken = "new_access_token"
            val newRefreshToken = "new_refresh_token"
            `when`(tokenStorage.getRefreshToken()).thenReturn(refreshToken)
            `when`(apiService.refreshToken(any())).thenReturn(
                Response.success(RefreshResponse(true, newAccessToken, newRefreshToken))
            )

            val result = repository.refreshSession()

            assertTrue(result.isSuccess)
            verify(tokenStorage).saveTokens(newAccessToken, newRefreshToken)
        }
    }

    @Test
    fun `refreshSession 401 clears tokens and cache`() {
        runBlocking {
            val refreshToken = "expired_refresh_token"
            `when`(tokenStorage.getRefreshToken()).thenReturn(refreshToken)
            `when`(apiService.refreshToken(any())).thenReturn(
                Response.error(401, "".toResponseBody(null))
            )

            val result = repository.refreshSession()

            assertTrue(result.isFailure)
            assertEquals("session_expired", result.exceptionOrNull()?.message)
            verify(tokenStorage).clearTokens()
        }
    }

    @Test
    fun `refreshSession network failure does not clear tokens or cache`() {
        runBlocking {
            val refreshToken = "refresh_token"
            `when`(tokenStorage.getRefreshToken()).thenReturn(refreshToken)
            `when`(apiService.refreshToken(any())).thenAnswer { throw java.io.IOException() }

            val result = repository.refreshSession()

            assertTrue(result.isFailure)
            verify(tokenStorage, never()).clearTokens()
        }
    }

    @Test
    fun `refreshSession 500 error does not clear tokens`() {
        runBlocking {
            val refreshToken = "refresh_token"
            `when`(tokenStorage.getRefreshToken()).thenReturn(refreshToken)
            `when`(apiService.refreshToken(any())).thenReturn(
                Response.error(500, "".toResponseBody(null))
            )

            val result = repository.refreshSession()

            assertTrue(result.isFailure)
            verify(tokenStorage, never()).clearTokens()
        }
    }

    @Test
    fun `concurrent refreshSession calls only trigger one API request`() {
        runBlocking {
            val initialToken = "refresh_token"
            var storageToken = initialToken
            
            `when`(tokenStorage.getRefreshToken()).thenAnswer { storageToken }
            `when`(tokenStorage.saveTokens(any(), any())).thenAnswer { invocation ->
                storageToken = invocation.arguments[1] as String
            }
            `when`(apiService.refreshToken(any())).thenAnswer {
                runBlocking { kotlinx.coroutines.delay(100) }
                Response.success(RefreshResponse(true, "new_access_token", "new_refresh_token"))
            }

            // Run multiple refreshes concurrently
            val jobs = List(5) {
                async(Dispatchers.Default) {
                    repository.refreshSession()
                }
            }
            jobs.awaitAll()

            // Verify API was called exactly once due to the "join" logic
            verify(apiService, times(1)).refreshToken(any())
        }
    }
}
