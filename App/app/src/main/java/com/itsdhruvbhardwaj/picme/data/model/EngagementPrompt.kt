package com.itsdhruvbhardwaj.picme.data.model

data class EngagementClaimRequest(val requestId: String, val activeSeconds: Int = 600, val sessions: Int = 2)
data class EngagementClaimResponse(val eligible: Boolean, val stopped: Boolean = false, val promptId: String? = null, val nextPromptAt: String? = null)
data class EngagementResponseRequest(val promptId: String, val action: String)
