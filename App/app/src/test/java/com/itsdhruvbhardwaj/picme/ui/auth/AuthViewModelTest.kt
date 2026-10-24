package com.itsdhruvbhardwaj.picme.ui.auth

import com.android.billingclient.api.Purchase
import com.itsdhruvbhardwaj.picme.data.model.PurchaseVerificationResponse
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import com.itsdhruvbhardwaj.picme.utils.BillingManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
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
        
        viewModel = AuthViewModel(authRepository, billingManager)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
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

        // Simulate successful purchase event
        billingEvents.emit(BillingManager.BillingEvent.PurchaseSuccess(mockPurchase))
        advanceUntilIdle()

        verify(authRepository).verifyPurchase(
            productId = "com.itsdhruvhardwaj.picme_credit_25",
            purchaseToken = "mock_token",
            purchaseOptionId = "buy-250-credits"
        )
        // verify(authRepository).getCurrentUser() is called inside checkSession()
        verify(authRepository, atLeastOnce()).getCurrentUser()
        
        val event = viewModel.uiEvent.first()
        assertEquals("Purchase successful! Credits added.", event)
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

        billingEvents.emit(BillingManager.BillingEvent.PurchaseSuccess(mockPurchase))
        advanceUntilIdle()

        val event = viewModel.uiEvent.first()
        assert(event.contains("Verification failed: Network error"))
    }
}
