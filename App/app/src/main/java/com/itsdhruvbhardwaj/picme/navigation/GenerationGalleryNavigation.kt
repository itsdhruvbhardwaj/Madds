package com.itsdhruvbhardwaj.picme.navigation

internal const val GALLERY_PHOTO_REQUEST = "gallery_photo_request"

/** A restored notification request must still belong to the signed-in account. */
internal fun requestedGalleryPhoto(value: String?, owner: String?): String? {
    if (owner == null) return null
    val parts = value?.split(":") ?: return null
    return parts.getOrNull(1)?.takeIf {
        parts.size == 2 && parts[0] == owner && Regex("[a-fA-F0-9]{24}").matches(it)
    }
}

// An old notification may arrive before reminders have loaded; the owned result
// endpoint then resolves its availability without starting another generation.
internal fun opensGenerationGallery(status: String?) = status == null || status == "completed"

// A saved null means the notification was already consumed, not a missing value.
internal fun restoredGenerationRequest(
    hasSavedEntry: Boolean, saved: String?, fromIntent: String?,
    intentEvent: String? = fromIntent, handledEvent: String? = null
): String? {
    if (!hasSavedEntry) return fromIntent
    if (fromIntent != null && intentEvent != handledEvent) return fromIntent
    return saved
}
