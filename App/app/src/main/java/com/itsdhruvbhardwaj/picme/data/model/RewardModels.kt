package com.itsdhruvbhardwaj.picme.data.model

import com.google.gson.annotations.SerializedName

/**
 * Response for a rewarded ad attempt request.
 * Contains the custom data ticket to be sent with the SSV callback.
 */
data class RewardAttemptResponse(
    @SerializedName("ok") val ok: Boolean,
    @SerializedName("ticket") val ticket: String?,
    @SerializedName("expiry") val expiry: Long?,
    @SerializedName("message") val message: String?
)
