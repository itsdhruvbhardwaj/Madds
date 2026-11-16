package com.itsdhruvbhardwaj.picme.data.model

data class DailyRewardStatus(
    val ok: Boolean = false, val enabled: Boolean = false, val eligible: Boolean = false,
    val claimed: Boolean = false, val credits: Int = 0, val revision: Int = 0,
    val dayKey: String = "", val serverTime: Long = 0, val nextResetAt: Long = 0,
    val timezone: String? = null
) {
    val validStatus: Boolean get() = ok && credits in 1..100000 && revision >= 0 &&
        Regex("\\d{4}-\\d{2}-\\d{2}").matches(dayKey) && serverTime > 0 &&
        nextResetAt > serverTime && nextResetAt - serverTime <= 86400000 && (!eligible || (enabled && !claimed))
    val validOffer: Boolean get() = validStatus && enabled && eligible && !claimed && credits in 1..100000 &&
        revision >= 0 && Regex("\\d{4}-\\d{2}-\\d{2}").matches(dayKey) && nextResetAt > serverTime
}
data class DailyRewardClaimRequest(val dayKey: String, val revision: Int)
data class DailyRewardClaimResponse(
    val ok: Boolean = false, val status: String? = null, val claimed: Boolean = false,
    val credits: Int = 0, val balance: Int = -1, val dayKey: String = "",
    val serverTime: Long = 0, val nextResetAt: Long = 0
) {
    val confirmed: Boolean get() = ok && claimed && status in listOf("claimed", "already_claimed") && balance >= 0 && credits in 1..100000
}
