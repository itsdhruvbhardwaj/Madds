package com.itsdhruvbhardwaj.picme.data.model

data class FeedbackRequest(val requestId: String, val category: String, val message: String, val contactEmail: String,
    val appVersion: String, val androidVersion: String)
data class FeedbackResponse(val ok: Boolean)
