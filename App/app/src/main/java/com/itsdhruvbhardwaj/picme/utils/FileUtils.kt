package com.itsdhruvbhardwaj.picme.utils

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okio.BufferedSink
import okio.source
import java.io.IOException

/**
 * Utility for handling file operations, specifically converting Android URIs to
 * multipart request bodies for networking.
 */
object FileUtils {

    /**
     * Converts a content URI to a [MultipartBody.Part].
     * Uses streaming to avoid loading large images into memory.
     *
     * @param contentResolver The application content resolver.
     * @param uri The URI of the image to convert.
     * @param partName The name of the multipart field expected by the backend.
     * @return A multipart part containing the image data, or null if conversion fails.
     */
    fun uriToMultipartPart(
        contentResolver: ContentResolver,
        uri: Uri,
        partName: String
    ): MultipartBody.Part? {
        return try {
            val type = contentResolver.getType(uri) ?: "image/*"
            val mediaType = type.toMediaTypeOrNull()
            val fileName = getFileName(contentResolver, uri) ?: "image_${System.currentTimeMillis()}.jpg"

            val requestBody = object : RequestBody() {
                override fun contentType(): MediaType? = mediaType

                override fun writeTo(sink: BufferedSink) {
                    contentResolver.openInputStream(uri)?.use { inputStream ->
                        sink.writeAll(inputStream.source())
                    } ?: throw IOException("Could not open input stream for URI: $uri")
                }
            }

            MultipartBody.Part.createFormData(partName, fileName, requestBody)
        } catch (e: Exception) {
            null
        }
    }

    private fun getFileName(contentResolver: ContentResolver, uri: Uri): String? {
        var name: String? = null
        try {
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (index != -1) {
                        name = cursor.getString(index)
                    }
                }
            }
        } catch (e: Exception) {
            // Fallback to null
        }
        return name
    }
}
