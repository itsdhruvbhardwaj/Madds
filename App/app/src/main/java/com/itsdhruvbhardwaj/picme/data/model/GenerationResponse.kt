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
    val status: String? = null,
    val resultExpiresAt: String? = null,
    val serverNow: String? = null
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
    val creditsCost: Int = 0,
    val serverNow: String? = null
)
data class GenerationOperationsResponse(val items: List<RecoverableGeneration>)

@androidx.annotation.Keep
data class GenerationGalleryResponse(
    val items: List<RecoverableGeneration>, val nextCursor: String? = null, val serverNow: String? = null
)

fun generationExpiry(value: String?): Long? {
    if (value == null) return null
    // These server dates are UTC ISO strings; SimpleDateFormat also works on Android 7.
    for (pattern in listOf("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'")) {
        val format = java.text.SimpleDateFormat(pattern, java.util.Locale.US).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC"); isLenient = false
        }
        val position = java.text.ParsePosition(0)
        val parsed = format.parse(value, position)
        if (parsed != null && position.index == value.length) return parsed.time
    }
    return null
}

fun generationTimeLeft(expires: Long, now: Long): String {
    val minutes = ((expires - now).coerceAtLeast(0) + 59_999) / 60_000
    return when {
        minutes == 0L -> "Expired"
        minutes < 60 -> "${minutes}m left"
        else -> "${minutes / 60}h ${minutes % 60}m left"
    }
}
