package com.itsdhruvbhardwaj.picme.data.repository

import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.MessageResponse
import com.itsdhruvbhardwaj.picme.data.model.User
import com.itsdhruvbhardwaj.picme.data.model.UserResponse
import com.itsdhruvbhardwaj.picme.data.remote.AuthApiService
import kotlinx.coroutines.runBlocking
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Test
import org.mockito.kotlin.*
import retrofit2.Response

class PasswordResetSessionTest {
    @Test fun `late profile response cannot recreate the cache after session clearing`() = runBlocking {
        val api = mock<AuthApiService>()
        val storage = mock<AuthTokenStorage>()
        whenever(storage.getAccessToken()).thenReturn("token", null)
        val user = User("user-a", "Tester", "test@example.com", true)
        whenever(api.getCurrentUser(any())).thenReturn(Response.success(UserResponse(true, user)))
        assertTrue(AuthRepository(api, storage).getCurrentUser().isFailure)
        verify(storage, never()).saveUser(any())
        Unit
    }

    @Test fun `invalid link does not clear tokens or cached profile`() = runBlocking {
        val api = mock<AuthApiService>()
        val storage = mock<AuthTokenStorage>()
        whenever(api.resetPassword(any())).thenReturn(Response.error(400, """{"ok":false,"error":"Invalid reset token"}""".toResponseBody()))
        assertTrue(AuthRepository(api, storage).resetPassword("invalid", "StrongPass1").isFailure)
        verify(storage, never()).clearTokens()
        Unit
    }

    @Test fun `only a confirmed successful response clears the local session`() = runBlocking {
        val api = mock<AuthApiService>()
        val storage = mock<AuthTokenStorage>()
        whenever(api.resetPassword(any())).thenReturn(Response.success(MessageResponse(false, "Not changed")))
        val repository = AuthRepository(api, storage)
        assertTrue(repository.resetPassword("invalid", "StrongPass1").isFailure)
        verify(storage, never()).clearTokens()
        whenever(api.resetPassword(any())).thenReturn(Response.success(MessageResponse(true, "Password changed")))
        assertTrue(repository.resetPassword("valid", "StrongPass1").isSuccess)
        verify(storage, times(1)).clearTokens()
        Unit
    }
}
