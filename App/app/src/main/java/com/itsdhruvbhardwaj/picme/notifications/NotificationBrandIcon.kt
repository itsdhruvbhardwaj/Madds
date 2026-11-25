package com.itsdhruvbhardwaj.picme.notifications

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
import android.graphics.RectF
import androidx.core.graphics.drawable.IconCompat
import com.itsdhruvbhardwaj.picme.R

/** Android small icons use alpha only. Preserve the actual launcher artwork's
 * silhouette rather than redrawing the logo or passing its opaque background. */
object NotificationBrandIcon {
    @Volatile private var cached: IconCompat? = null
    fun get(context: Context): IconCompat = cached ?: synchronized(this) {
        cached ?: runCatching {
            val source = BitmapFactory.decodeResource(context.resources, R.mipmap.ic_launcher_foreground)
                ?: error("Missing app artwork")
            val pixels = IntArray(source.width * source.height)
            source.getPixels(pixels, 0, source.width, 0, 0, source.width, source.height)
            var left = source.width; var top = source.height; var right = -1; var bottom = -1
            pixels.indices.forEach { index ->
                val pixel = pixels[index]
                val brightness = maxOf(Color.red(pixel), Color.green(pixel), Color.blue(pixel))
                val alpha = (((brightness - 24).coerceAtLeast(0) * 255 / 231) * Color.alpha(pixel) / 255).coerceIn(0, 255)
                pixels[index] = Color.argb(alpha, 255, 255, 255)
                if (alpha > 32) {
                    val x = index % source.width; val y = index / source.width
                    left = minOf(left, x); right = maxOf(right, x)
                    top = minOf(top, y); bottom = maxOf(bottom, y)
                }
            }
            check(right >= left && bottom >= top)
            val mask = Bitmap.createBitmap(pixels, source.width, source.height, Bitmap.Config.ARGB_8888)
            val output = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
            val height = 92f * (bottom - top + 1) / (right - left + 1)
            Canvas(output).drawBitmap(mask, Rect(left, top, right + 1, bottom + 1),
                RectF(2f, (96f - height) / 2, 94f, (96f + height) / 2), android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG))
            source.recycle(); mask.recycle()
            IconCompat.createWithBitmap(output)
        }.getOrElse { IconCompat.createWithResource(context, R.drawable.ic_notification) }.also { cached = it }
    }
}
