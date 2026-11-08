package com.itsdhruvbhardwaj.picme.data.repository

import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.local.EngagementStore
import com.itsdhruvbhardwaj.picme.data.model.*
import com.itsdhruvbhardwaj.picme.data.remote.AuthApiService
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.mockito.kotlin.*
import retrofit2.Response

class EngagementRepositoryTest {
    private val user = User("owner", "Name", "user@example.com", true)
    @Test fun `successful feedback stops the account locally only after server confirmation`() = runBlocking {
        val api = mock<AuthApiService>(); val storage = mock<AuthTokenStorage>(); val engagement = mock<EngagementStore>()
        whenever(storage.getUser()).thenReturn(user); whenever(storage.getAccessToken()).thenReturn("token")
        whenever(api.sendFeedback(any(), any())).thenReturn(Response.success(FeedbackResponse(true)))
        val request = FeedbackRequest("id", "OTHER", "Please improve this app", "", "1", "13")
        assertTrue(AuthRepository(api, storage, api, engagement).sendFeedback(request).getOrThrow())
        verify(engagement).feedbackSubmitted("owner")
        Unit
    }
    @Test fun `failed feedback does not stop prompts as though it was submitted`() = runBlocking {
        val api = mock<AuthApiService>(); val storage = mock<AuthTokenStorage>(); val engagement = mock<EngagementStore>()
        whenever(storage.getUser()).thenReturn(user); whenever(storage.getAccessToken()).thenReturn("token")
        whenever(api.sendFeedback(any(), any())).thenReturn(Response.success(FeedbackResponse(false)))
        assertFalse(AuthRepository(api, storage, api, engagement).sendFeedback(FeedbackRequest("id", "OTHER", "Feedback message", "", "1", "13")).getOrThrow())
        verify(engagement, never()).feedbackSubmitted(any())
        Unit
    }
    @Test fun `an old account coordinator cannot claim a prompt as the newly signed in account`() = runBlocking {
        val api = mock<AuthApiService>(); val storage = mock<AuthTokenStorage>()
        whenever(storage.getUser()).thenReturn(user.copy(id = "new-owner")); whenever(storage.getAccessToken()).thenReturn("new-token")
        val repository = AuthRepository(api, storage)
        assertTrue(repository.claimEngagementPrompt("owner", EngagementClaimRequest("id")).isFailure)
        assertTrue(repository.respondEngagementPrompt("owner", EngagementResponseRequest("id", "RATE")).isFailure)
        verify(api, never()).claimEngagementPrompt(any(), any())
        verify(api, never()).respondEngagementPrompt(any(), any())
        Unit
    }
}
