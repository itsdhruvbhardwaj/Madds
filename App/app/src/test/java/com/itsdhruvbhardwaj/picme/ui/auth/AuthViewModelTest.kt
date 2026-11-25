package com.itsdhruvbhardwaj.picme.ui.auth

import com.android.billingclient.api.Purchase
import com.itsdhruvbhardwaj.picme.data.model.PurchaseVerificationResponse
import com.itsdhruvbhardwaj.picme.data.model.User
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import com.itsdhruvbhardwaj.picme.utils.BillingManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.mockito.Mock
import org.mockito.Mockito.`when`
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.*

@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelTest {

    @Mock
    private lateinit var authRepository: AuthRepository

    @Mock
    private lateinit var billingManager: BillingManager

    private lateinit var viewModel: AuthViewModel
    private val testDispatcher = StandardTestDispatcher()

    private val billingEvents = MutableSharedFlow<BillingManager.BillingEvent>()

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        Dispatchers.setMain(testDispatcher)
        
        `when`(billingManager.billingEvent).thenReturn(billingEvents)
        `when`(billingManager.productDetails).thenReturn(MutableStateFlow(null))
        `when`(authRepository.getCachedUser()).thenReturn(User("user-a", "Tester", "test@example.com", true))
        runBlocking { `when`(authRepository.getCurrentUser()).thenReturn(Result.success(User("user-a", "Tester", "test@example.com", true))) }
        
        viewModel = AuthViewModel(authRepository, billingManager)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test fun `uncertain refresh failure keeps an existing login`() = runTest(testDispatcher) {
        whenever(authRepository.getCurrentUser()).thenReturn(Result.failure(Exception("invalid_token")))
        whenever(authRepository.refreshSession()).thenReturn(Result.failure(Exception("refresh_failed")))
        viewModel.checkSession().join()
        advanceUntilIdle()
        org.junit.Assert.assertTrue(viewModel.authState.value is AuthState.Authenticated)
        verify(authRepository, never()).logout()
    }

    @Test fun `confirmed expired session still requires sign in`() = runTest(testDispatcher) {
        whenever(authRepository.getCurrentUser()).thenReturn(Result.failure(Exception("invalid_token")))
        whenever(authRepository.refreshSession()).thenReturn(Result.failure(Exception("session_expired")))
        viewModel.checkSession().join()
        advanceUntilIdle()
        assertEquals(AuthState.Unauthenticated, viewModel.authState.value)
    }

    @Test fun `reward label refreshes from remote configuration on each opening`() = runTest {
        whenever(authRepository.getRewardedAdConfig()).thenReturn(
            Result.success(com.itsdhruvbhardwaj.picme.data.model.RewardedAdConfigResponse(true, true, 2)),
            Result.success(com.itsdhruvbhardwaj.picme.data.model.RewardedAdConfigResponse(true, true, 5)))
        viewModel.refreshRewardConfig()
        advanceUntilIdle()
        assertEquals(2, viewModel.rewardedAdConfig.value?.credits)
        viewModel.refreshRewardConfig()
        advanceUntilIdle()
        assertEquals(5, viewModel.rewardedAdConfig.value?.credits)
        verify(authRepository, times(2)).getRewardedAdConfig()
    }

    @Test fun `unavailable reward configuration clears the previously advertised amount`() = runTest {
        whenever(authRepository.getRewardedAdConfig()).thenReturn(
            Result.success(com.itsdhruvbhardwaj.picme.data.model.RewardedAdConfigResponse(true, true, 2)),
            Result.failure(java.io.IOException("offline")))
        viewModel.refreshRewardConfig(); advanceUntilIdle()
        viewModel.refreshRewardConfig(); advanceUntilIdle()
        assertEquals(null, viewModel.rewardedAdConfig.value)
        assertEquals(false, viewModel.rewardConfigLoading.value)
    }

    @Test fun `rapid reward configuration refreshes share one in-flight call`() = runTest {
        whenever(authRepository.getRewardedAdConfig()).thenReturn(Result.success(
            com.itsdhruvbhardwaj.picme.data.model.RewardedAdConfigResponse(true, true, 3)))
        viewModel.refreshRewardConfig(); viewModel.refreshRewardConfig(); viewModel.refreshRewardConfig()
        advanceUntilIdle()
        verify(authRepository, times(1)).getRewardedAdConfig()
    }

    @Test
    fun `when purchase is successful, verifyPurchase is called and balance is refreshed`() = runTest {
        val mockPurchase = mock<Purchase> {
            on { products } doReturn listOf("com.itsdhruvhardwaj.picme_credit_25")
            on { purchaseToken } doReturn "mock_token"
        }
        
        `when`(authRepository.verifyPurchase(any(), any(), any())).thenReturn(
            Result.success(PurchaseVerificationResponse(true, "Verified", 250))
        )
        `when`(authRepository.getCurrentUser()).thenReturn(Result.success(mock()))

        runCurrent() // Start the billing collector before emitting callbacks.
        val event = async(start = CoroutineStart.UNDISPATCHED) { viewModel.uiEvent.first() }
        billingEvents.emit(BillingManager.BillingEvent.PurchaseSuccess(mockPurchase))
        advanceUntilIdle()

        verify(authRepository).verifyPurchase(
            productId = "com.itsdhruvhardwaj.picme_credit_25",
            purchaseToken = "mock_token",
            purchaseOptionId = "buy-250-credits"
        )
        // verify(authRepository).getCurrentUser() is called inside checkSession()
        verify(authRepository, atLeastOnce()).getCurrentUser()
        
        assertEquals("Purchase successful! Credits added.", event.await())
    }

    @Test
    fun `when purchase verification fails, error event is emitted`() = runTest {
        val mockPurchase = mock<Purchase> {
            on { products } doReturn listOf("com.itsdhruvhardwaj.picme_credit_25")
            on { purchaseToken } doReturn "mock_token"
        }
        
        `when`(authRepository.verifyPurchase(any(), any(), any())).thenReturn(
            Result.failure(Exception("Network error"))
        )

        runCurrent()
        val event = async(start = CoroutineStart.UNDISPATCHED) { viewModel.uiEvent.first() }
        billingEvents.emit(BillingManager.BillingEvent.PurchaseSuccess(mockPurchase))
        advanceUntilIdle()

        assert(event.await().contains("Reopen the app to retry"))
    }

    @Test fun `purchase belonging to another app account is not submitted for credits`() = runTest {
        val identifiers = mock<com.android.billingclient.api.AccountIdentifiers> {
            on { obfuscatedAccountId } doReturn com.itsdhruvbhardwaj.picme.utils.billingAccountId("other-user")
        }
        val purchase = mock<Purchase> { on { accountIdentifiers } doReturn identifiers }
        runCurrent()
        val event = async(start = CoroutineStart.UNDISPATCHED) { viewModel.uiEvent.first() }
        billingEvents.emit(BillingManager.BillingEvent.PurchaseSuccess(purchase)); advanceUntilIdle()
        assert(event.await().contains("account used for this purchase"))
        verify(authRepository, never()).verifyPurchase(any(), any(), any())
    }
}
