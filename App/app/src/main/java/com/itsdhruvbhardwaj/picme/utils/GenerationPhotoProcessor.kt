package com.itsdhruvbhardwaj.picme.utils

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorSpace
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.roundToInt

/** Upload copies only: originals are never modified or written back to storage. */
object GenerationPhotoProcessor {
    const val MAX_EDGE = 1024
    const val JPEG_QUALITY = 82
    private const val MAX_BYTES = 512_000

    internal fun targetSize(width: Int, height: Int, maxEdge: Int = MAX_EDGE): Pair<Int, Int> {
        require(width > 0 && height > 0 && maxEdge > 0) { "Couldn't read this photo. Please choose another image." }
        val scale = minOf(1.0, maxEdge.toDouble() / max(width, height))
        return maxOf(1, (width * scale).roundToInt()) to maxOf(1, (height * scale).roundToInt())
    }

    fun multipart(resolver: ContentResolver, uri: Uri, partName: String): MultipartBody.Part {
        val decoded = try { decode(resolver, uri) }
        catch (error: Exception) { throw IllegalArgumentException("Couldn't prepare this photo. Please select it again.", error) }
        try {
            val (width, height) = targetSize(decoded.width, decoded.height)
            // Composite transparency onto white instead of allowing JPEG's black background.
            var prepared = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            try {
                Canvas(prepared).apply {
                    drawColor(Color.WHITE)
                    drawBitmap(decoded, null, android.graphics.Rect(0, 0, width, height), android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG))
                }
                val output = ByteArrayOutputStream()
                var quality = JPEG_QUALITY
                while (true) {
                    output.reset()
                    check(prepared.compress(Bitmap.CompressFormat.JPEG, quality, output)) { "Couldn't compress this photo." }
                    if (output.size() <= MAX_BYTES) break
                    if (quality > 66) quality -= 8
                    else {
                        val smaller = Bitmap.createScaledBitmap(prepared, maxOf(1, (prepared.width * .85).roundToInt()), maxOf(1, (prepared.height * .85).roundToInt()), true)
                        prepared.recycle(); prepared = smaller; quality = JPEG_QUALITY
                    }
                }
                return MultipartBody.Part.createFormData(partName, "generation-reference.jpg", output.toByteArray().toRequestBody("image/jpeg".toMediaType()))
            } finally { prepared.recycle() }
        } finally { decoded.recycle() }
    }

    private fun decode(resolver: ContentResolver, uri: Uri): Bitmap {
        if (Build.VERSION.SDK_INT >= 28) {
            // ImageDecoder applies EXIF rotation/mirroring and samples during decode.
            return ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri)) { decoder, info, _ ->
                val (width, height) = targetSize(info.size.width, info.size.height)
                decoder.setTargetSize(width, height)
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                decoder.setTargetColorSpace(ColorSpace.get(ColorSpace.Named.SRGB))
            }
        }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        targetSize(bounds.outWidth, bounds.outHeight)
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_EDGE) sample *= 2
        val bitmap = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 })
        } ?: error("Couldn't decode this photo.")
        try {
            val orientation = runCatching { resolver.openInputStream(uri)?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) } }.getOrNull()
            val matrix = Matrix().apply {
                when (orientation) {
                    ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
                    ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
                    ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
                    ExifInterface.ORIENTATION_TRANSPOSE -> { setRotate(90f); postScale(-1f, 1f) }
                    ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
                    ExifInterface.ORIENTATION_TRANSVERSE -> { setRotate(-90f); postScale(-1f, 1f) }
                    ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(270f)
                }
            }
            val oriented = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            if (oriented !== bitmap) bitmap.recycle()
            return oriented
        } catch (error: Exception) { bitmap.recycle(); throw error }
    }
}
