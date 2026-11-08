package com.itsdhruvbhardwaj.picme.data.repository

import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.*
import com.itsdhruvbhardwaj.picme.data.remote.*
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import org.mockito.kotlin.*
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response

class StylePreferenceRepositoryTest {
    private val api = mock<StyleApiService>()
    private val storage = mock<AuthTokenStorage>()
    private fun setup(): StyleRepository {
        whenever(storage.getAccessToken()).thenReturn("token")
        whenever(storage.getStylePreference(any())).thenReturn("all")
        return StyleRepository(api, storage, discoverySeed = "session-test")
    }
    @Test fun `saved selection is sent on every discovery request including next page`() = runBlocking {
        val repository = setup()
        whenever(api.stylePreference(any())).thenReturn(Response.success(StylePreferenceResponse("all")))
        repository.syncStylePreference("user-a")
        whenever(api.saveStylePreference(any(), any())).thenReturn(Response.success(StylePreferenceResponse("male")))
        assertTrue(repository.saveStylePreference("male").isSuccess)
        whenever(api.getStyles(anyOrNull(), any(), any(), anyOrNull(), anyOrNull(), any(), any(), anyOrNull())).thenReturn(Response.success(StyleResponse(styles = emptyList())))
        whenever(api.getHomeConfig(any(), any(), anyOrNull())).thenReturn(Response.success(HomeConfigResponse(emptyList())))
        whenever(api.getCollections(any())).thenReturn(Response.success(CollectionsResponse(emptyList())))
        repository.getStyles(1, 18)
        repository.getStyles(2, 18, "Fashion", "kurta")
        repository.getHomeConfig()
        repository.getCollections()
        verify(api).getStyles("Bearer token", 1, 18, null, null, false, "male", "session-test")
        verify(api).getStyles("Bearer token", 2, 18, "Fashion", "kurta", false, "male", "session-test")
        verify(api).getHomeConfig(true, "male", "session-test")
        verify(api).getCollections("male")
        verify(storage).saveStylePreference("user-a", "male")
    }
    @Test fun `failed save leaves the existing preference intact`() = runBlocking {
        val repository = setup()
        whenever(api.stylePreference(any())).thenReturn(Response.success(StylePreferenceResponse("female")))
        repository.syncStylePreference("user-a")
        whenever(api.saveStylePreference(any(), any())).thenThrow(RuntimeException("offline"))
        assertTrue(repository.saveStylePreference("male").isFailure)
        assertEquals("female", repository.stylePreference.value)
    }
    @Test fun `late account response cannot overwrite the next account`() = runBlocking {
        val repository = setup()
        val started = CompletableDeferred<Unit>()
        val response = CompletableDeferred<Response<StylePreferenceResponse>>()
        whenever(api.stylePreference(any())).doSuspendableAnswer { started.complete(Unit); response.await() }
        val old = launch { repository.syncStylePreference("user-a") }
        started.await()
        repository.syncStylePreference(null)
        response.complete(Response.success(StylePreferenceResponse("female")))
        old.join()
        assertEquals("all", repository.stylePreference.value)
        verify(storage, never()).saveStylePreference(eq("user-a"), any())
    }
    @Test fun `an old initial sync cannot replace a newly saved selection`() = runBlocking {
        val repository = setup()
        val started = CompletableDeferred<Unit>()
        val response = CompletableDeferred<Response<StylePreferenceResponse>>()
        whenever(api.stylePreference(any())).doSuspendableAnswer { started.complete(Unit); response.await() }
        val sync = launch { repository.syncStylePreference("user-a") }
        started.await()
        whenever(api.saveStylePreference(any(), any())).thenReturn(Response.success(StylePreferenceResponse("male")))
        repository.saveStylePreference("male").getOrThrow()
        response.complete(Response.success(StylePreferenceResponse("female")))
        sync.join()
        assertEquals("male", repository.stylePreference.value)
    }
    @Test fun `collection server outages never trigger a full catalogue scan`() = runBlocking {
        val repository = setup()
        whenever(api.getCollections(any())).thenReturn(Response.error(503, "unavailable".toResponseBody()))
        val result = repository.getCollections()
        assertTrue(result.isFailure)
        assertEquals("server_overloaded", result.exceptionOrNull()?.message)
        verify(api, times(3)).getCollections("all")
        verify(api, never()).getStyles(anyOrNull(), any(), any(), anyOrNull(), anyOrNull(), any(), any(), anyOrNull())
        Unit
    }

}
