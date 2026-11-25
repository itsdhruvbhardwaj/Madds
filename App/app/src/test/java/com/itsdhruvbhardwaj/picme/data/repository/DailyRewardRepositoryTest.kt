package com.itsdhruvbhardwaj.picme.data.repository

import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.*
import com.itsdhruvbhardwaj.picme.data.remote.AuthApiService
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.mockito.kotlin.*
import retrofit2.Response

class DailyRewardRepositoryTest {
    private val user = User("owner", "Name", "owner@example.com", true, credits = 10)
    @Test fun `only a confirmed server balance is persisted after a daily claim`() = runBlocking {
        val api = mock<AuthApiService>(); val storage = mock<AuthTokenStorage>()
        whenever(storage.getUser()).thenReturn(user); whenever(storage.getAccessToken()).thenReturn("token")
        val body = DailyRewardClaimResponse(true, "claimed", true, 2, 12, "2026-11-16", 1000, 11000)
        whenever(api.claimDailyReward(any(), any())).thenReturn(Response.success(body))
        val result = AuthRepository(api, storage).claimDailyReward("owner", DailyRewardClaimRequest("2026-11-16", 1))
        assertTrue(result.isSuccess); verify(storage).saveUser(user.copy(credits = 12))
        verify(storage).recordDailyRewardClaim("owner", "2026-11-16"); Unit
    }
    @Test fun `an old account cannot submit a daily reward as another signed in account`() = runBlocking {
        val api = mock<AuthApiService>(); val storage = mock<AuthTokenStorage>()
        whenever(storage.getUser()).thenReturn(user.copy(id = "other")); whenever(storage.getAccessToken()).thenReturn("token")
        assertTrue(AuthRepository(api, storage).claimDailyReward("owner", DailyRewardClaimRequest("2026-11-16", 1)).isFailure)
        verify(api, never()).claimDailyReward(any(), any()); verify(storage, never()).saveUser(any()); Unit
    }
    @Test fun `unconfirmed or mismatched receipts never update the balance`() = runBlocking {
        val api = mock<AuthApiService>(); val storage = mock<AuthTokenStorage>()
        whenever(storage.getUser()).thenReturn(user); whenever(storage.getAccessToken()).thenReturn("token")
        whenever(api.claimDailyReward(any(), any())).thenReturn(Response.success(DailyRewardClaimResponse(true, "claimed", true, 2, 12, "2026-11-15")))
        assertTrue(AuthRepository(api, storage).claimDailyReward("owner", DailyRewardClaimRequest("2026-11-16", 1)).isFailure)
        verify(storage, never()).saveUser(any()); Unit
    }
}
