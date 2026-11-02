package com.itsdhruvbhardwaj.picme.notifications

import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.RefreshResponse
import com.itsdhruvbhardwaj.picme.data.remote.AuthApiService
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.mockito.kotlin.*
import retrofit2.Response
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

class PushRefreshCoordinationTest {
    @Test fun `late refresh responses cannot reinstate an account after logout`() = runBlocking {
        val storage = mock<AuthTokenStorage>(); val api = mock<AuthApiService>()
        val refresh = AtomicReference<String?>("old-refresh")
        whenever(storage.getRefreshToken()).thenAnswer { refresh.get() }
        whenever(storage.getAccessToken()).thenReturn("old-access")
        whenever(api.refreshToken(any())).thenAnswer {
            refresh.set(null) // User signed out while the request was in flight.
            Response.success(RefreshResponse(true, "new-access", "new-refresh"))
        }
        val result = AuthRepository(api, storage).refreshSession("old-access")
        assertTrue(result.isFailure)
        verify(storage, never()).saveRefreshedTokens(any(), any())
        verify(storage, never()).clearTokens()
    }
    @Test fun `background and foreground repositories serialize refresh together`() = runBlocking {
        val storage = mock<AuthTokenStorage>(); val api = mock<AuthApiService>()
        val access = AtomicReference("old-access"); val refresh = AtomicReference("old-refresh"); val calls = AtomicInteger()
        whenever(storage.getAccessToken()).thenAnswer { access.get() }
        whenever(storage.getRefreshToken()).thenAnswer { refresh.get() }
        whenever(api.refreshToken(any())).thenAnswer {
            calls.incrementAndGet(); Thread.sleep(30)
            Response.success(RefreshResponse(true, "new-access", "new-refresh"))
        }
        doAnswer { access.set(it.getArgument(0)); refresh.set(it.getArgument(1)); null }
            .whenever(storage).saveRefreshedTokens(any(), any())
        val repositories = listOf(AuthRepository(api, storage), AuthRepository(api, storage))
        val results = repositories.map { repository -> async(Dispatchers.IO) { repository.refreshSession("old-access") } }.awaitAll()
        assertTrue(results.all { it.isSuccess }); assertEquals(1, calls.get())
    }
}
