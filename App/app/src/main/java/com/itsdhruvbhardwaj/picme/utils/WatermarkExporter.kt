package com.itsdhruvbhardwaj.picme.utils

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName
import com.itsdhruvbhardwaj.picme.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.InputStream
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

data class WatermarkConfig(
    @SerializedName("enabled") val enabled: Boolean? = null,
    @SerializedName("logoUrl") val logoUrl: String? = null,
    @SerializedName("widthPercent") val widthPercent: Int? = null,
    @SerializedName("opacityPercent") val opacityPercent: Int? = null,
    @SerializedName("paddingPercent") val paddingPercent: Int? = null,
    @SerializedName("revision") val revision: Long? = null
) {
    fun valid(): Boolean = enabled != null && widthPercent in 5..35 && opacityPercent in 10..100 &&
        paddingPercent in 1..10 && revision != null && revision >= 0 &&
        (enabled == false || logoUrl?.matches(Regex("https://res\\.cloudinary\\.com/[a-zA-Z0-9_-]+/image/upload/v[0-9]+/picmee/branding/watermarks/logo-[0-9a-f-]{36}\\.png")) == true)
}

data class WatermarkBounds(val left: Float, val top: Float, val right: Float, val bottom: Float)

/** Relative to image pixels, so exported portrait, landscape and square photos match. */
internal fun watermarkBounds(width: Int, height: Int, logoWidth: Int, logoHeight: Int, size: Int, padding: Int): WatermarkBounds {
    require(width > 0 && height > 0 && logoWidth > 0 && logoHeight > 0 && size in 5..35 && padding in 1..10)
    val margin = minOf(width, height) * padding / 100f
    val scale = minOf(width * size / 100f / logoWidth, (height - 2 * margin) / logoHeight)
    val right = width - margin
    val bottom = height - margin
    return WatermarkBounds(right - logoWidth * scale, bottom - logoHeight * scale, right, bottom)
}

/** Export only: never modify the generation preview or send the logo to the AI provider. */
object WatermarkExporter {
    private val lock = Mutex()
    private val gson = Gson()
    private val client = OkHttpClient.Builder().connectTimeout(4, TimeUnit.SECONDS).readTimeout(6, TimeUnit.SECONDS)
        .callTimeout(8, TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build()
    private const val MAX_LOGO_BYTES = 2 * 1024 * 1024
    private fun readBounded(stream: InputStream, limit: Int): ByteArray {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
            val count = stream.read(buffer, 0, minOf(buffer.size, limit + 1 - output.size()))
            if (count < 0) break
            output.write(buffer, 0, count)
            check(output.size() <= limit) { "Response too large" }
        }
        return output.toByteArray()
    }

    suspend fun prepare(context: Context, original: Bitmap): Bitmap = withContext(Dispatchers.IO) { lock.withLock {
        val app = context.applicationContext
        val prefs = app.getSharedPreferences("madds_watermark", Context.MODE_PRIVATE)
        val current = runCatching {
            client.newCall(Request.Builder().url("${BuildConfig.BACKEND_BASE_URL.trimEnd('/')}/api/app-config/watermark").build()).execute().use { response ->
                check(response.isSuccessful)
                val body = response.body ?: error("Missing settings")
                val bytes = body.byteStream().use { readBounded(it, 16 * 1024) }
                gson.fromJson(String(bytes, Charsets.UTF_8), WatermarkConfig::class.java).also { check(it.valid()) }
            }
        }.getOrElse {
            runCatching { gson.fromJson(prefs.getString("config", null), WatermarkConfig::class.java).takeIf { it.valid() } }.getOrNull()
                ?: error("Couldn't load image export settings. Please connect and try again.")
        }
        if (current.enabled == false) {
            prefs.edit().putString("config", gson.toJson(current)).commit()
            return@withLock original
        }
        val url = current.logoUrl!!
        val hash = MessageDigest.getInstance("SHA-256").digest(url.toByteArray()).joinToString("") { "%02x".format(it) }
        // Files, rather than cacheDir, retain the last working logo for offline exports.
        val directory = File(app.filesDir, "watermark").apply { mkdirs() }
        val cached = File(directory, "$hash.png")
        if (!cached.exists()) {
            val bytes = try {
                client.newCall(Request.Builder().url(url).build()).execute().use { response ->
                    check(response.isSuccessful)
                    val body = response.body ?: error("Missing logo")
                    body.byteStream().use { readBounded(it, MAX_LOGO_BYTES) }
                }
            } catch (_: Exception) { error("Couldn't load the watermark logo. Please connect and try again.") }
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            check(bounds.outWidth in 1..4096 && bounds.outHeight in 1..4096 && bounds.outWidth.toLong() * bounds.outHeight <= 4_000_000) { "Invalid watermark logo. Please try again later." }
            val temporary = File(directory, "$hash.tmp")
            temporary.writeBytes(bytes)
            check(temporary.renameTo(cached)) { "Couldn't cache the watermark. Please try again." }
        }
        val logo = BitmapFactory.decodeFile(cached.path) ?: run {
            cached.delete()
            error("Couldn't read the watermark logo. Please try again.")
        }
        try {
            val bounds = watermarkBounds(original.width, original.height, logo.width, logo.height, current.widthPercent!!, current.paddingPercent!!)
            val output = original.copy(Bitmap.Config.ARGB_8888, true) ?: error("Couldn't prepare this image for saving.")
            Canvas(output).drawBitmap(logo, null, RectF(bounds.left, bounds.top, bounds.right, bounds.bottom),
                Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply { alpha = current.opacityPercent!! * 255 / 100 })
            prefs.edit().putString("config", gson.toJson(current)).commit()
            // Keep only the last successful immutable logo; originals stay untouched.
            directory.listFiles()?.filter { it.name != cached.name }?.forEach { it.delete() }
            output
        } finally { logo.recycle() }
    } }
}
