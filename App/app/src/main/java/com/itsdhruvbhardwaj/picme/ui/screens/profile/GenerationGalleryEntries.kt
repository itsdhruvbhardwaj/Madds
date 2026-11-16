package com.itsdhruvbhardwaj.picme.ui.screens.profile

import android.net.Uri
import com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration
import com.itsdhruvbhardwaj.picme.data.model.generationExpiry

internal enum class GenerationGalleryTab { Unsaved, Saved }

internal data class GenerationGalleryEntry(
    val key: String,
    val generationId: String? = null,
    val operation: RecoverableGeneration? = null,
    val savedUri: Uri? = null
)

internal fun generationGalleryEntries(
    operations: List<RecoverableGeneration>, savedUris: Map<String, Uri>, localImages: List<Uri>,
    now: Long, tab: GenerationGalleryTab
): List<GenerationGalleryEntry> {
    if (tab == GenerationGalleryTab.Unsaved) return operations.filter {
        it.id !in savedUris && (it.status == "processing" ||
            (it.status == "completed" && it.resultAvailable && (generationExpiry(it.resultExpiresAt) ?: 0) > now))
    }.map { GenerationGalleryEntry("generation:${it.id}", it.id, it) }

    // MediaStore's external and external_primary URIs can refer to the same photo.
    val photos = linkedMapOf<String, GenerationGalleryEntry>()
    fun add(uri: Uri, id: String? = null, operation: RecoverableGeneration? = null) {
        val mediaKey = uri.lastPathSegment ?: uri.toString()
        photos.putIfAbsent(mediaKey, GenerationGalleryEntry("saved:$mediaKey", id, operation, uri))
    }
    operations.forEach { operation -> savedUris[operation.id]?.let { add(it, operation.id, operation) } }
    savedUris.forEach { (id, uri) -> add(uri, id) }
    localImages.forEach { add(it) }
    return photos.values.toList()
}
