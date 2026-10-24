package com.itsdhruvbhardwaj.picme.data.model

data class GooglePlayPurchaseRequest(
    val productId: String,
    val purchaseToken: String,
    val purchaseOptionId: String
)

data class PurchaseVerificationResponse(
    val ok: Boolean,
    val message: String,
    val newBalance: Int? = null
)
