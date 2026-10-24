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
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Encapsulates Google Play Billing Library logic for PicMe.
 * Handles product querying, purchase flow, and result processing.
 */
class BillingManager(private val context: Context) : PurchasesUpdatedListener {

    private val TAG = "BillingManager"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val billingClient = BillingClient.newBuilder(context)
        .setListener(this)
        .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
        .build()

    private val _productDetails = MutableStateFlow<ProductDetails?>(null)
    val productDetails = _productDetails.asStateFlow()

    private val _billingEvent = MutableSharedFlow<BillingEvent>()
    val billingEvent = _billingEvent.asSharedFlow()

    private var isConnecting = false

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
        if (billingClient.isReady || isConnecting) return

        isConnecting = true
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                isConnecting = false
                if (billingResult.responseCode == BillingResponseCode.OK) {
                    Log.d(TAG, "Billing Client connected successfully")
                    queryProduct()
                } else {
                    Log.e(TAG, "Billing Client connection failed: ${billingResult.debugMessage}")
                }
            }

            override fun onBillingServiceDisconnected() {
                isConnecting = false
                Log.d(TAG, "Billing Client disconnected")
                scope.launch { _billingEvent.emit(BillingEvent.ServiceDisconnected) }
            }
        })
    }

    private fun queryProduct() {
        val productList = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId("com.itsdhruvhardwaj.picme_credit_25")
                .setProductType(ProductType.INAPP)
                .build()
        )

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build()

        billingClient.queryProductDetailsAsync(params) { billingResult, queryProductDetailsResult ->
            if (billingResult.responseCode == BillingResponseCode.OK) {
                var foundProduct: ProductDetails? = null
                for (details in queryProductDetailsResult.productDetailsList) {
                    if (details.productId == "com.itsdhruvhardwaj.picme_credit_25") {
                        foundProduct = details
                        break
                    }
                }
                _productDetails.value = foundProduct
                if (foundProduct == null) {
                    Log.e(TAG, "Product not found in Google Play Console")
                }
            } else {
                Log.e(TAG, "Query failed: ${billingResult.debugMessage}")
            }
        }
    }

    /**
     * Launches the billing flow for the credit pack.
     */
    fun launchPurchaseFlow(activity: Activity) {
        val product = _productDetails.value
        if (product == null) {
            scope.launch { _billingEvent.emit(BillingEvent.Error("Product unavailable. Please try again later.")) }
            startConnection()
            return
        }

        val productDetailsParamsList = listOf(
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(product)
                .build()
        )

        val billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(productDetailsParamsList)
            .build()

        val result = billingClient.launchBillingFlow(activity, billingFlowParams)
        if (result.responseCode != BillingResponseCode.OK) {
            Log.e(TAG, "Launch flow failed: ${result.debugMessage}")
            scope.launch { _billingEvent.emit(BillingEvent.Error("Failed to start purchase: ${result.debugMessage}")) }
        }
    }

    /**
     * Queries purchases that haven't been acknowledged/consumed yet.
     */
    fun queryPurchases(onResult: (List<Purchase>) -> Unit) {
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
                    purchases?.forEach { purchase ->
                        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                            _billingEvent.emit(BillingEvent.PurchaseSuccess(purchase))
                        } else if (purchase.purchaseState == Purchase.PurchaseState.PENDING) {
                            _billingEvent.emit(BillingEvent.Pending)
                        }
                    }
                }
                BillingResponseCode.USER_CANCELED -> {
                    _billingEvent.emit(BillingEvent.Canceled)
                }
                else -> {
                    _billingEvent.emit(BillingEvent.Error(billingResult.debugMessage, billingResult.responseCode))
                }
            }
        }
    }

    fun endConnection() {
        if (billingClient.isReady) {
            billingClient.endConnection()
        }
    }
}
