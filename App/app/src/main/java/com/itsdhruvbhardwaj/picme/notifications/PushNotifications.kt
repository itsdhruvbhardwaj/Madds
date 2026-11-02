package com.itsdhruvbhardwaj.picme.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager
import com.google.gson.Gson
import com.itsdhruvbhardwaj.picme.MainActivity
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.BuildConfig
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage

object PushNotifications {
    const val OPEN_ACTION = "com.itsdhruvbhardwaj.picme.OPEN_NOTIFICATION"
    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= 26) {
            val manager = context.getSystemService(NotificationManager::class.java)
            PushCategory.entries.forEach { category -> manager.createNotificationChannel(
                NotificationChannel(category.channelId, category.label, NotificationManager.IMPORTANCE_HIGH).apply {
                    description = category.description
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 180, 100, 180)
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
                }) }
        }
    }

    fun permissionGranted(context: Context): Boolean = NotificationManagerCompat.from(context).areNotificationsEnabled() &&
        (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)

    fun headsUpEnabled(context: Context, category: PushCategory): Boolean = Build.VERSION.SDK_INT < 26 ||
        (context.getSystemService(NotificationManager::class.java).getNotificationChannel(category.channelId)?.importance ?: 0) >= NotificationManager.IMPORTANCE_HIGH

    fun channelAllowed(context: Context, category: PushCategory): Boolean = permissionGranted(context) &&
        (Build.VERSION.SDK_INT < 26 || context.getSystemService(NotificationManager::class.java)
            .getNotificationChannel(category.channelId)?.importance != NotificationManager.IMPORTANCE_NONE)

    fun receive(context: Context, data: Map<String, String>) {
        val payload = PushPayload.parse(data) ?: run {
            if (BuildConfig.DEBUG) Log.d("MaddsPush", "Suppressed: invalid payload")
            return
        }
        val auth = AuthTokenStorage(context)
        val state = PushLocalState(context)
        synchronized(PushLocalState.lock) {
            createChannels(context)
            if (!state.eligible(payload, auth)) {
                if (BuildConfig.DEBUG) Log.d("MaddsPush", "Suppressed: ${state.diagnosticStatus(payload, auth)}")
                return
            }
            if (!channelAllowed(context, payload.category)) {
                if (BuildConfig.DEBUG) Log.d("MaddsPush", "Suppressed: device or channel permission")
                return
            }
            val session = PushSession.fromToken(auth.getAccessToken()) ?: return
            // Persist before posting. A crash can drop a message, but cannot re-alert it.
            if (!state.remember(data, payload, session)) return
            post(context, payload)
            if (BuildConfig.DEBUG) Log.d("MaddsPush", "Notification posting completed")
        }
        if (payload.imageUrl != null) {
            // Display text immediately; optional image work survives service/process exit.
            runCatching {
                val work = OneTimeWorkRequest.Builder(PushImageWorker::class.java)
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .setInputData(Data.Builder().putString("payload", Gson().toJson(data)).build()).build()
                WorkManager.getInstance(context).enqueueUniqueWork("push-image-${payload.deliveryId}", ExistingWorkPolicy.KEEP, work)
            }
        }
    }

    @Suppress("MissingPermission")
    fun post(context: Context, payload: PushPayload, image: Bitmap? = null) {
        val intent = Intent(context, MainActivity::class.java).apply {
            action = OPEN_ACTION
            data = Uri.parse("madds-notification://open/${payload.deliveryId}")
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pending = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, payload.category.channelId)
            .setSmallIcon(NotificationBrandIcon.get(context)).setColor(android.graphics.Color.WHITE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .apply { if (Build.VERSION.SDK_INT < 26) { setDefaults(NotificationCompat.DEFAULT_SOUND); setVibrate(longArrayOf(0, 180, 100, 180)) } }
            .setContentTitle(payload.title).setContentText(payload.body)
            .setStyle(if (image != null) NotificationCompat.BigPictureStyle().bigPicture(image).setSummaryText(payload.body)
                else NotificationCompat.BigTextStyle().bigText(payload.body))
            .setContentIntent(pending).setAutoCancel(true).setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setTimeoutAfter(86_400_000L)
            .addExtras(Bundle().apply { putString("madds_category", payload.category.key) })
            .build()
        try { NotificationManagerCompat.from(context).notify(PushLocalState.TAG_PREFIX + payload.deliveryId, 0, notification) }
        catch (_: SecurityException) { /* Permission can be revoked between checking and posting. */ }
    }

    fun tapId(intent: Intent?): String? = intent?.takeIf { it.action == OPEN_ACTION }?.data?.let {
        if (it.scheme == "madds-notification" && it.host == "open" && it.pathSegments.size == 1 &&
            Regex("[a-fA-F0-9]{24}").matches(it.pathSegments[0])) it.pathSegments[0] else null
    }
}
