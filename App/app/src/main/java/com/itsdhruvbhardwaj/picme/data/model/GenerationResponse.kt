package com.itsdhruvbhardwaj.picme.data.model

/**
 * Data model for the image generation response.
 *
 * @property ok Whether the generation was successful.
 * @property image The generated image data (e.g., base64 string or URL).
 * @property message Optional message from the server (usually on failure).
 */
data class GenerationResponse(
    val ok: Boolean,
    val image: String? = null,
    val message: String? = null,
    val generationId: String? = null,
    val status: String? = null
)

data class RecoverableGeneration(
    val id: String,
    val styleId: String = "",
    val styleName: String = "Your photo",
    val status: String = "processing",
    val failureCode: String? = null,
    val failureReason: String? = null,
    val processingExpiresAt: String? = null,
    val resultAvailable: Boolean = false,
    val resultExpiresAt: String? = null,
    val creditsCost: Int = 0
)
data class GenerationOperationsResponse(val items: List<RecoverableGeneration>)
