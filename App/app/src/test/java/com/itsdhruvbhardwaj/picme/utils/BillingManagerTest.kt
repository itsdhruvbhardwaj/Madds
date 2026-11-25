package com.itsdhruvbhardwaj.picme.utils

import android.content.Context
import com.android.billingclient.api.*
import com.google.gson.Gson
import com.itsdhruvbhardwaj.picme.data.model.PurchaseVerificationResponse
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.*
import org.junit.*
import org.junit.Assert.*
import org.mockito.kotlin.*

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class BillingManagerTest {
    @Test fun `each new pack selects its own offer and purchase option`() {
        for (credits in listOf(40, 110)) {
            val id = "madds_credits_$credits"
            val offer = mock<ProductDetails.OneTimePurchaseOfferDetails> { on { purchaseOptionId } doReturn "buy-$credits-credits" }
            val product = mock<ProductDetails> { on { productId } doReturn id; on { oneTimePurchaseOfferDetailsList } doReturn listOf(offer) }
            assertEquals(credits, BillingManager.creditPacks[id])
            assertSame(offer, BillingManager.creditOffer(product))
        }
    }
    private val dispatcher = StandardTestDispatcher()
    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun teardown() { Dispatchers.resetMain() }

    @Test fun `successful connection recovers owned purchases even before collector starts`() = runTest(dispatcher) {
        val client = mock<BillingClient>()
        val ok = BillingResult.newBuilder().setResponseCode(BillingClient.BillingResponseCode.OK).build()
        val purchase = mock<Purchase> {
            on { products } doReturn listOf(BillingManager.CREDIT_PRODUCT_ID)
            on { purchaseState } doReturn Purchase.PurchaseState.PURCHASED
        }
        val productResult = mock<QueryProductDetailsResult> { on { productDetailsList } doReturn emptyList() }
        var connection: BillingClientStateListener? = null
        doAnswer { connection = it.getArgument(0); null }.whenever(client).startConnection(any())
        doAnswer {
            it.getArgument<ProductDetailsResponseListener>(1).onProductDetailsResponse(ok, productResult); null
        }.whenever(client).queryProductDetailsAsync(any(), any())
        doAnswer {
            it.getArgument<PurchasesResponseListener>(1).onQueryPurchasesResponse(ok, listOf(purchase)); null
        }.whenever(client).queryPurchasesAsync(any(), any())
        val manager = BillingManager(mock<Context>()) { _, _ -> client }
        manager.queryPurchases { fail("Cannot query before connected") }
        whenever(client.isReady).thenReturn(true)
        connection!!.onBillingSetupFinished(ok); runCurrent()
        assertEquals(purchase, (manager.billingEvent.first() as BillingManager.BillingEvent.PurchaseSuccess).purchase)
        verify(client, times(1)).queryPurchasesAsync(any(), any())
        manager.endConnection()
    }

    @Test fun `displayed price and checkout select the configured buy option`() {
        val other = mock<ProductDetails.OneTimePurchaseOfferDetails> { on { purchaseOptionId } doReturn "rent" }
        val correct = mock<ProductDetails.OneTimePurchaseOfferDetails> { on { purchaseOptionId } doReturn BillingManager.CREDIT_OPTION_ID }
        val product = mock<ProductDetails> {
            on { oneTimePurchaseOfferDetailsList } doReturn listOf(other, correct)
            on { oneTimePurchaseOfferDetails } doReturn other
        }
        assertSame(correct, BillingManager.creditOffer(product))
    }

    @Test fun `backward compatible price is accepted even when Play returns an offer list without option IDs`() {
        val legacy = mock<ProductDetails.OneTimePurchaseOfferDetails> { on { formattedPrice } doReturn "₹99.00" }
        val product = mock<ProductDetails> {
            on { oneTimePurchaseOfferDetailsList } doReturn listOf(legacy)
            on { oneTimePurchaseOfferDetails } doReturn legacy
        }
        assertSame(legacy, BillingManager.creditOffer(product))
        assertEquals("₹99.00", BillingManager.creditOffer(product)?.formattedPrice)
    }

    @Test fun `explicitly different purchase option is never used as a fallback`() {
        val other = mock<ProductDetails.OneTimePurchaseOfferDetails> { on { purchaseOptionId } doReturn "another-pack" }
        val product = mock<ProductDetails> {
            on { oneTimePurchaseOfferDetailsList } doReturn listOf(other)
            on { oneTimePurchaseOfferDetails } doReturn other
        }
        assertNull(BillingManager.creditOffer(product))
    }

    @Test fun `price refresh distinguishes loading failure and successful retry`() = runTest(dispatcher) {
        val client = mock<BillingClient>()
        val ok = BillingResult.newBuilder().setResponseCode(BillingClient.BillingResponseCode.OK).build()
        val failure = BillingResult.newBuilder().setResponseCode(BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE).build()
        val offer = mock<ProductDetails.OneTimePurchaseOfferDetails> { on { formattedPrice } doReturn "₹99.00" }
        val product = mock<ProductDetails> { on { productId } doReturn BillingManager.CREDIT_PRODUCT_ID; on { oneTimePurchaseOfferDetails } doReturn offer }
        val empty = mock<QueryProductDetailsResult> { on { productDetailsList } doReturn emptyList() }
        val available = mock<QueryProductDetailsResult> { on { productDetailsList } doReturn listOf(product) }
        var connection: BillingClientStateListener? = null
        val callbacks = mutableListOf<ProductDetailsResponseListener>()
        doAnswer { connection=it.getArgument(0); null }.whenever(client).startConnection(any())
        doAnswer { callbacks += it.getArgument<ProductDetailsResponseListener>(1); null }.whenever(client).queryProductDetailsAsync(any(),any())
        val manager = BillingManager(mock<Context>()) { _, _ -> client }
        whenever(client.isReady).thenReturn(true)
        connection!!.onBillingSetupFinished(ok)
        assertTrue(manager.productLoading.value)
        assertNull(manager.productError.value)
        callbacks[0].onProductDetailsResponse(failure, empty)
        assertFalse(manager.productLoading.value)
        assertNotNull(manager.productError.value)
        manager.refreshCreditProduct()
        assertTrue(manager.productLoading.value)
        assertNull(manager.productError.value)
        callbacks[1].onProductDetailsResponse(ok, available)
        assertFalse(manager.productLoading.value)
        assertNull(manager.productError.value)
        assertEquals("₹99.00", BillingManager.creditOffer(manager.productDetails.value!!)?.formattedPrice)
        manager.endConnection()
    }

    @Test fun `account identifier is stable opaque and different for another account`() {
        assertEquals(64, billingAccountId("user-a").length)
        assertEquals(billingAccountId("user-a"), billingAccountId("user-a"))
        assertNotEquals(billingAccountId("user-a"), billingAccountId("user-b"))
    }

    @Test fun `parses the real backend fulfillment response without obsolete required fields`() {
        val response = Gson().fromJson("""{"ok":true,"status":"credited","creditsGranted":250,"balanceAfter":350}""", PurchaseVerificationResponse::class.java)
        assertTrue(response.ok); assertEquals(350, response.balanceAfter); assertEquals(250, response.creditsGranted)
        assertNull(response.message)
    }
}
