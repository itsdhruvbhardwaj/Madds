package com.itsdhruvbhardwaj.picme.data.model

data class GooglePlayPurchaseRequest(
    val productId: String,
    val purchaseToken: String,
    val purchaseOptionId: String
)

data class PurchaseVerificationResponse(
    val ok: Boolean,
    val message: String? = null,
    val newBalance: Int? = null,
    val status: String? = null,
    val creditsGranted: Int? = null,
    val balanceAfter: Int? = null
)

data class PurchaseHistoryResponse(val ok: Boolean, val purchases: List<PurchaseHistoryItem> = emptyList(), val hasMore: Boolean = false)
data class PurchaseHistoryItem(
    val productId: String, val creditsGranted: Int = 0, val quantity: Int = 1,
    val amount: Double = 0.0, val currency: String = "USD", val status: String = "pending",
    val purchaseTime: String? = null, val verifiedAt: String? = null, val createdAt: String? = null,
    val displayName: String? = null
)
data class CreditHistoryResponse(val ok: Boolean, val transactions: List<CreditHistoryItem> = emptyList(), val hasMore: Boolean = false)
data class CreditHistoryItem(
    val amount: Int, val type: String, val balanceAfter: Int, val description: String = "",
    val createdAt: String? = null, val displayName: String? = null
)
