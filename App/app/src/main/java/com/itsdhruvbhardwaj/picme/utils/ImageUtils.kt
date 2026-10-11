package com.itsdhruvbhardwaj.picme.utils

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream

object ImageUtils {

    /**
     * Cleans a Base64 string by removing the data URI prefix if present.
     */
    fun cleanBase64(base64String: String): String {
        return if (base64String.contains(",")) {
            base64String.substringAfter(",")
        } else {
            base64String
        }
    }

    /**
     * Decodes a Base64 string into a ByteArray.
     */
    fun decodeBase64ToBytes(base64String: String): ByteArray? {
        return try {
            Base64.decode(cleanBase64(base64String), Base64.DEFAULT)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Decodes a Base64 string into a Bitmap.
     */
    fun decodeBase64ToBitmap(base64String: String): Bitmap? {
        val bytes = decodeBase64ToBytes(base64String) ?: return null
        return try {
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Saves a Bitmap to the device gallery using MediaStore.
     */
    suspend fun saveBitmapToGallery(context: Context, bitmap: Bitmap): Result<Uri> = withContext(Dispatchers.IO) {
        val filename = "PicMe_${System.currentTimeMillis()}.jpg"
        var outputStream: OutputStream? = null
        var uri: Uri? = null

        try {
            val resolver = context.contentResolver
            val contentValues = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/PicMe")
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
            }

            val imageCollection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
            } else {
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            }

            uri = resolver.insert(imageCollection, contentValues)
            if (uri == null) throw Exception("Failed to create MediaStore entry")

            outputStream = resolver.openOutputStream(uri)
            if (outputStream == null) throw Exception("Failed to open output stream")

            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 100, outputStream)) {
                throw Exception("Failed to compress bitmap")
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                contentValues.clear()
                contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0)
                resolver.update(uri, contentValues, null, null)
            }

            Result.success(uri)
        } catch (e: Exception) {
            uri?.let { context.contentResolver.delete(it, null, null) }
            Result.failure(e)
        } finally {
            outputStream?.close()
        }
    }

    /**
     * Shares an image using the Android Sharesheet.
     */
    suspend fun shareImage(context: Context, bitmap: Bitmap): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val cachePath = File(context.cacheDir, "images")
            cachePath.mkdirs()
            val file = File(cachePath, "shared_creation.jpg")
            val stream = FileOutputStream(file)
            bitmap.compress(Bitmap.CompressFormat.JPEG, 100, stream)
            stream.close()

            val contentUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file
            )

            if (contentUri != null) {
                val shareIntent = Intent().apply {
                    action = Intent.ACTION_SEND
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    setDataAndType(contentUri, "image/jpeg")
                    putExtra(Intent.EXTRA_STREAM, contentUri)
                    type = "image/jpeg"
                }
                
                val chooser = Intent.createChooser(shareIntent, "Share your PicMe creation")
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(chooser)
                Result.success(Unit)
            } else {
                Result.failure(Exception("Failed to generate share URI"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
