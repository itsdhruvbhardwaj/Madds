package com.itsdhruvbhardwaj.picme.notifications

import android.content.Context
import android.app.NotificationManager
import android.graphics.BitmapFactory
import androidx.annotation.Keep
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage

/** Image failure never prevents delivery of the notification's text. */
@Keep
class PushImageWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val data = runCatching { Gson().fromJson<Map<String, String>>(inputData.getString("payload"),
            object : TypeToken<Map<String, String>>() {}.type) }.getOrNull() ?: return Result.success()
        val payload = PushPayload.parse(data) ?: return Result.success()
        val url = payload.imageUrl ?: return Result.success()
        val context = applicationContext; val state = PushLocalState(context); val auth = AuthTokenStorage(context)
        fun stillVisible(): Boolean = state.eligible(payload, auth, false) && PushNotifications.channelAllowed(context, payload.category) &&
            context.getSystemService(NotificationManager::class.java).activeNotifications.any { it.tag == PushLocalState.TAG_PREFIX + payload.deliveryId }
        if (!stillVisible()) return Result.success()
        val bytes = PushImageDownloader.get(context).load(url) { isStopped } ?: return Result.success()
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return Result.success()
        val options = BitmapFactory.Options().apply {
            inSampleSize = 1
            while (bounds.outWidth / inSampleSize > 1024 || bounds.outHeight / inSampleSize > 1024) inSampleSize *= 2
        }
        val image = runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) }.getOrNull() ?: return Result.success()
        synchronized(PushLocalState.lock) { if (stillVisible()) PushNotifications.post(context, payload, image) }
        return Result.success()
    }
}
