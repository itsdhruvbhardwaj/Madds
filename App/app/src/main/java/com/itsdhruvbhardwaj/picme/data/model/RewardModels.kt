package com.itsdhruvbhardwaj.picme.data.model

import com.google.gson.annotations.SerializedName

/**
 * Response for a rewarded ad attempt request.
 * Contains the custom data to be sent with the SSV callback.
 * Matches backend POST /api/rewarded-ads/attempts response exactly.
 */
data class RewardAttemptResponse(
    @SerializedName("ok") val ok: Boolean,
    @SerializedName("customData") val customData: String?,
    @SerializedName("expiresAt") val expiresAt: String?,
    @SerializedName("message") val message: String? = null,
    @SerializedName("error") val error: String? = null
)
