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
    val message: String? = null
)
