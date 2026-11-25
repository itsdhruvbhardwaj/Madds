package com.itsdhruvbhardwaj.picme.utils

import android.app.Activity
import android.content.Context
import android.util.Log
import com.android.billingclient.api.*
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClient.ProductType
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Encapsulates Google Play Billing Library logic for PicMe.
 * Handles product querying, purchase flow, and result processing.
 */
class BillingManager(context: Context, clientFactory: (Context, PurchasesUpdatedListener) -> BillingClient = { app, listener ->
    BillingClient.newBuilder(app).setListener(listener)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .enableAutoServiceReconnection().build()
}) : PurchasesUpdatedListener {
    companion object {
        const val CREDIT_PRODUCT_ID = "com.itsdhruvhardwaj.picme_credit_25"
        const val CREDIT_OPTION_ID = "buy-250-credits"
        val creditPacks = linkedMapOf("madds_credits_40" to 40, "madds_credits_110" to 110, CREDIT_PRODUCT_ID to 250)
        fun optionId(productId: String) = "buy-${creditPacks[productId] ?: error("Unknown credit pack")}-credits"
        fun creditOffer(product: ProductDetails): ProductDetails.OneTimePurchaseOfferDetails? {
            val expectedOption = optionId(product.productId.takeIf { it in creditPacks } ?: CREDIT_PRODUCT_ID)
            val offers = product.oneTimePurchaseOfferDetailsList.orEmpty()
            return offers.firstOrNull { it.purchaseOptionId == expectedOption && it.offerId.isNullOrBlank() }
                ?: offers.firstOrNull { it.purchaseOptionId == expectedOption }
                // The backward-compatible offer may omit its option ID even
                // when Play also populates the offer list. Never reject it just
                // because that list is nonempty; reject explicit mismatches.
                ?: product.oneTimePurchaseOfferDetails?.takeIf { it.purchaseOptionId.isNullOrBlank() || it.purchaseOptionId == expectedOption }
        }
    }

    private val TAG = "BillingManager"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val billingClient = clientFactory(context, this)

    private val _productDetails = MutableStateFlow<ProductDetails?>(null)
    val productDetails = _productDetails.asStateFlow()
    private val _products = MutableStateFlow<Map<String, ProductDetails>>(emptyMap())
    val products = _products.asStateFlow()
    private val _productLoading = MutableStateFlow(true)
    val productLoading = _productLoading.asStateFlow()
    private val _productError = MutableStateFlow<String?>(null)
    val productError = _productError.asStateFlow()
    private var queryingProduct = false
    private var productQueryVersion = 0

    // Purchase callbacks can arrive before AuthViewModel starts collecting.
    private val _billingEvent = Channel<BillingEvent>(Channel.BUFFERED)
    val billingEvent = _billingEvent.receiveAsFlow()

    private var isConnecting = false
    private var closed = false

    sealed interface BillingEvent {
        data class PurchaseSuccess(val purchase: Purchase) : BillingEvent
        data class Error(val message: String, val code: Int? = null) : BillingEvent
        data object Canceled : BillingEvent
        data object Pending : BillingEvent
        data object ServiceDisconnected : BillingEvent
    }

    init {
        startConnection()
    }

    fun startConnection() {
        if (closed || billingClient.isReady || isConnecting) return

        isConnecting = true
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (closed) return
                isConnecting = false
                if (billingResult.responseCode == BillingResponseCode.OK) {
                    Log.d(TAG, "Billing Client connected successfully")
                    queryProduct()
                    queryPurchases { purchases -> publishPurchases(purchases) }
                } else {
                    _productLoading.value = false
                    _productError.value = "Couldn't connect to Google Play. Tap to retry."
                    Log.e(TAG, "Billing Client connection failed: ${billingResult.debugMessage}")
                }
            }

            override fun onBillingServiceDisconnected() {
                isConnecting = false
                queryingProduct = false
                productQueryVersion++
                _productLoading.value = false
                _productError.value = "Google Play disconnected. Tap to retry."
                Log.d(TAG, "Billing Client disconnected")
                scope.launch { _billingEvent.send(BillingEvent.ServiceDisconnected) }
            }
        })
    }

    fun refreshCreditProduct() {
        if (closed) return
        _productLoading.value = true
        _productError.value = null
        if (billingClient.isReady) queryProduct() else startConnection()
    }

    private fun queryProduct() {
        if (closed || queryingProduct) return
        queryingProduct = true
        val queryVersion = ++productQueryVersion
        _productLoading.value = true
        _productError.value = null
        val productList = creditPacks.keys.map { id ->
            QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(ProductType.INAPP).build()
        }

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build()

        billingClient.queryProductDetailsAsync(params) { billingResult, queryProductDetailsResult ->
            if (closed || queryVersion != productQueryVersion) return@queryProductDetailsAsync
            queryingProduct = false
            if (billingResult.responseCode == BillingResponseCode.OK) {
                var foundProduct: ProductDetails? = null
                for (details in queryProductDetailsResult.productDetailsList) {
                    if (details.productId == CREDIT_PRODUCT_ID) {
                        foundProduct = details
                        break
                    }
                }
                _products.value = queryProductDetailsResult.productDetailsList.filter { it.productId in creditPacks }.associateBy { it.productId }
                _productDetails.value = foundProduct
                _productError.value = if (_products.value.values.any { creditOffer(it) != null }) null else "Couldn't load this credit pack's price. Tap to retry."
                if (foundProduct == null) {
                    Log.e(TAG, "Product not found in Google Play Console")
                }
            } else {
                _products.value = emptyMap()
                _productDetails.value = null
                _productError.value = "Couldn't load the price from Google Play. Tap to retry."
                Log.e(TAG, "Query failed: ${billingResult.debugMessage}")
            }
            _productLoading.value = false
        }
    }

    /**
     * Launches the billing flow for the credit pack.
     */
    fun launchPurchaseFlow(activity: Activity, userId: String, productId: String = CREDIT_PRODUCT_ID) {
        if (!billingClient.isReady) {
            startConnection()
            scope.launch { _billingEvent.send(BillingEvent.Error("Connecting to Google Play. Please try again.")) }
            return
        }
        val product = _products.value[productId] ?: _productDetails.value?.takeIf { it.productId == productId }
        if (product == null) {
            scope.launch { _billingEvent.send(BillingEvent.Error("Product unavailable. Please try again later.")) }
            queryProduct()
            return
        }

        val offer = creditOffer(product)
        if (offer == null) {
            scope.launch { _billingEvent.send(BillingEvent.Error("This credit pack is currently unavailable.")) }
            return
        }

        val productDetailsParamsList = listOf(
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(product)
                .apply { offer.offerToken?.takeIf { it.isNotBlank() }?.let { setOfferToken(it) } }
                .build()
        )

        val billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(productDetailsParamsList)
            .setObfuscatedAccountId(billingAccountId(userId))
            .build()

        val result = billingClient.launchBillingFlow(activity, billingFlowParams)
        if (result.responseCode != BillingResponseCode.OK) {
            Log.e(TAG, "Launch flow failed: ${result.debugMessage}")
            scope.launch { _billingEvent.send(BillingEvent.Error("Could not open Google Play checkout. Please try again.", result.responseCode)) }
        }
    }

    /**
     * Queries purchases that haven't been acknowledged/consumed yet.
     */
    fun queryPurchases(onResult: (List<Purchase>) -> Unit) {
        if (closed) return
        if (!billingClient.isReady) {
            startConnection()
            return
        }

        val params = QueryPurchasesParams.newBuilder()
            .setProductType(ProductType.INAPP)
            .build()

        billingClient.queryPurchasesAsync(params) { billingResult, purchases ->
            if (billingResult.responseCode == BillingResponseCode.OK) {
                onResult(purchases)
            } else {
                Log.e(TAG, "Query purchases failed: ${billingResult.debugMessage}")
            }
        }
    }

    override fun onPurchasesUpdated(billingResult: BillingResult, purchases: MutableList<Purchase>?) {
        scope.launch {
            when (billingResult.responseCode) {
                BillingResponseCode.OK -> {
                    if (purchases.isNullOrEmpty()) _billingEvent.send(BillingEvent.Error("No completed purchase was returned. Please try again."))
                    else publishPurchases(purchases)
                }
                BillingResponseCode.USER_CANCELED -> {
                    _billingEvent.send(BillingEvent.Canceled)
                }
                else -> {
                    if (billingResult.responseCode == BillingResponseCode.ITEM_ALREADY_OWNED) queryPurchases(::publishPurchases)
                    _billingEvent.send(BillingEvent.Error("Google Play could not complete the purchase. Please try again.", billingResult.responseCode))
                }
            }
        }
    }

    private fun publishPurchases(purchases: List<Purchase>) {
        scope.launch {
            purchases.filter { it.products.any { id -> id in creditPacks } }.forEach { purchase ->
                when (purchase.purchaseState) {
                    Purchase.PurchaseState.PURCHASED -> _billingEvent.send(BillingEvent.PurchaseSuccess(purchase))
                    Purchase.PurchaseState.PENDING -> _billingEvent.send(BillingEvent.Pending)
                }
            }
        }
    }

    fun endConnection() {
        closed = true
        scope.cancel()
        _billingEvent.close()
        billingClient.endConnection()
    }
}
