package com.itsdhruvbhardwaj.picme.data.repository

import com.google.gson.Gson
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.*
import com.itsdhruvbhardwaj.picme.data.remote.AuthApiService
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.mockito.kotlin.*
import retrofit2.Response

class ProfileRepositoryTest {
    private val user = User("user-a", "Tester", "test@example.com", true,
        profileAppearance = "avatar", avatarId = "avatar_001", avatarBackground = "sage", profileSetupComplete = true)

    @Test fun `older cached profiles do not trigger setup`() {
        val old = Gson().fromJson("""{"id":"old","name":"Name","email":"old@example.com","emailVerified":true,"profileImage":"https://example.com/photo.jpg"}""", User::class.java)
        assertNull(old.profileSetupComplete)
        assertNull(old.profileAppearance)
        assertEquals("https://example.com/photo.jpg", old.profileImage)
    }

    @Test fun `saved avatar and background survive serialization used by the profile cache`() {
        val gson = Gson()
        assertEquals(user, gson.fromJson(gson.toJson(user), User::class.java))
    }

    @Test fun `appearance save caches the server profile for the signed-in account`() = runBlocking {
        val api = mock<AuthApiService>()
        val storage = mock<AuthTokenStorage>()
        whenever(storage.getAccessToken()).thenReturn("token")
        whenever(storage.getUser()).thenReturn(user)
        whenever(api.updateProfileAppearance(any(), any())).thenReturn(Response.success(UserResponse(true, user)))
        val request = ProfileAppearanceRequest("avatar", "avatar_001", "sage")
        val result = AuthRepository(api, storage).updateProfileAppearance(request)
        assertEquals(user, result.getOrThrow())
        verify(api).updateProfileAppearance("Bearer token", request)
        verify(storage).saveUser(user)
        Unit
    }

    @Test fun `a late upload response cannot replace the profile of a different account`() = runBlocking {
        val api = mock<AuthApiService>()
        val storage = mock<AuthTokenStorage>()
        whenever(storage.getAccessToken()).thenReturn("token")
        whenever(storage.getUser()).thenReturn(user.copy(id = "user-b"))
        whenever(api.uploadProfilePhoto(any(), any())).thenReturn(Response.success(UserResponse(true, user)))
        val result = AuthRepository(api, storage).uploadProfilePhoto(byteArrayOf(1, 2, 3))
        assertTrue(result.isFailure)
        verify(storage, never()).saveUser(any())
        Unit
    }
}
