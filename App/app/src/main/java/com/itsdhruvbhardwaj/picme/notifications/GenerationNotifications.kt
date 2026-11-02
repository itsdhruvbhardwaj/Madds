package com.itsdhruvbhardwaj.picme.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.itsdhruvbhardwaj.picme.MainActivity
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration

object GenerationNotifications {
    const val OPEN_ACTION = "com.itsdhruvbhardwaj.picme.OPEN_GENERATION"
    const val PROGRESS = "madds_generation_progress"
    const val READY = "madds_generation_results"
    const val DOWNLOADS = "madds_photo_downloads"
    private const val PREFIX = "madds-generation:"
    private val idPattern = Regex("[a-fA-F0-9]{24}")
    private fun expiry(value: String?): Long = runCatching {
        java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }.parse(value ?: "")?.time
    }.getOrNull() ?: (System.currentTimeMillis() + 86_400_000)

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(NotificationManager::class.java)
        listOf(Triple(PROGRESS, "Photo generation progress", NotificationManager.IMPORTANCE_LOW),
            Triple(READY, "Photo ready and generation results", NotificationManager.IMPORTANCE_HIGH),
            Triple(DOWNLOADS, "Photo downloads and saving", NotificationManager.IMPORTANCE_LOW)).forEach { (id, name, importance) ->
            manager.createNotificationChannel(NotificationChannel(id, name, importance).apply {
                lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
                enableVibration(id == READY)
                if (id == READY) vibrationPattern = longArrayOf(0, 180, 100, 180)
            })
        }
    }

    fun receive(context: Context, data: Map<String, String>) {
        val owner = data["recipientUserId"]?.takeIf(idPattern::matches) ?: return
        val id = data["generationId"]?.takeIf(idPattern::matches) ?: return
        val stage = data["stage"]?.takeIf { it in setOf("completed", "failed", "outcome_unknown") } ?: return
        val version = data["bindingVersion"]?.toLongOrNull() ?: return
        synchronized(PushLocalState.lock) {
            val auth = AuthTokenStorage(context)
            if (!PushLocalState(context).serviceEligible(owner, version, auth)) return
            post(context, owner, id, stage, expiry(data["expiresAt"]))
        }
    }

    fun sync(context: Context, owner: String?, items: List<RecoverableGeneration>) {
        synchronized(PushLocalState.lock) {
            if (owner == null || AuthTokenStorage(context).getUser()?.id != owner) return
            items.filter { idPattern.matches(it.id) }.forEach { post(context, owner, it.id, it.status, expiry(it.resultExpiresAt)) }
        }
    }

    @Suppress("MissingPermission")
    private fun post(context: Context, owner: String, id: String, stage: String, expiresAt: Long) {
        if (stage !in setOf("processing", "completed", "failed", "outcome_unknown")) return
        if (!PushNotifications.permissionGranted(context)) return
        if (expiresAt <= System.currentTimeMillis()) return
        createChannels(context)
        val terminal = stage != "processing"
        val prefs = context.getSharedPreferences("madds_generation_alerts", Context.MODE_PRIVATE)
        val key = "$owner:$id"
        if (stage == "processing" && prefs.contains("terminal_$key")) return
        if (terminal && prefs.getBoolean("shown_$key:$stage", false)) return
        if (terminal) prefs.edit().putBoolean("shown_$key:$stage", true).putString("terminal_$key", stage).commit()
        val title = when (stage) {
            "completed" -> "Your photo is ready"
            "failed" -> "Photo generation failed"
            "outcome_unknown" -> "Your generation needs review"
            else -> "Creating your photo"
        }
        val body = when (stage) {
            "completed" -> "Tap to view and save your photo before its recovery copy expires."
            "failed" -> "Your reserved credits were refunded. Tap to view details."
            "outcome_unknown" -> "The provider outcome is unconfirmed. Open Madds for details."
            else -> "You can keep browsing. Tap to check this generation."
        }
        val notification = base(context, owner, id, if (terminal) READY else PROGRESS)
            .setContentTitle(title).setContentText(body)
            .setPriority(if (terminal) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_LOW)
            .setOngoing(!terminal).setAutoCancel(terminal).setOnlyAlertOnce(!terminal)
        notification.setTimeoutAfter((expiresAt - System.currentTimeMillis()).coerceAtLeast(1))
        if (terminal && Build.VERSION.SDK_INT < 26) notification.setDefaults(NotificationCompat.DEFAULT_SOUND).setVibrate(longArrayOf(0, 180, 100, 180))
        if (!terminal) notification.setProgress(0, 0, true)
        runCatching {
            val manager = NotificationManagerCompat.from(context)
            // Different channel semantics need separate tags to allow the final alert.
            if (terminal) manager.cancel("${PREFIX}progress:$key", 0)
            manager.notify("$PREFIX${if (terminal) "result" else "progress"}:$key", 0, notification.build())
        }
    }

    @Suppress("MissingPermission")
    fun download(context: Context, owner: String?, id: String?, stage: String) {
        synchronized(PushLocalState.lock) {
            if (owner == null || AuthTokenStorage(context).getUser()?.id != owner || !PushNotifications.permissionGranted(context)) return
            createChannels(context)
            val active = stage in setOf("downloading", "saving")
            val title = when (stage) {
                "saving" -> "Saving your photo…"
                "saved" -> "Photo saved to your gallery"
                "downloaded" -> "Photo downloaded"
                "failed" -> "Couldn't download or save your photo"
                "waiting" -> "Your photo is still generating"
                else -> "Downloading your photo…"
            }
            val notification = base(context, owner, id.orEmpty(), DOWNLOADS).setContentTitle(title)
                .setContentText(if (active) "Please wait a moment." else "Open Madds to view your photo.")
                .setPriority(NotificationCompat.PRIORITY_LOW).setOnlyAlertOnce(true).setOngoing(active).setAutoCancel(!active)
            if (active) notification.setProgress(0, 0, true).setTimeoutAfter(180_000) else notification.setTimeoutAfter(10_000)
            runCatching { NotificationManagerCompat.from(context).notify("${PREFIX}download:$owner:$id", 0, notification.build()) }
        }
    }

    private fun base(context: Context, owner: String, id: String, channel: String): NotificationCompat.Builder {
        val intent = Intent(context, MainActivity::class.java).apply {
            action = OPEN_ACTION; data = Uri.parse("madds-generation://open/$owner/$id")
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        return NotificationCompat.Builder(context, channel).setSmallIcon(NotificationBrandIcon.get(context))
            .setColor(android.graphics.Color.WHITE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    }

    fun tap(intent: Intent?): String? = intent?.takeIf { it.action == OPEN_ACTION }?.data?.let { uri ->
        if (uri.scheme == "madds-generation" && uri.host == "open" && uri.pathSegments.size == 2 && uri.pathSegments.all(idPattern::matches))
            uri.pathSegments.joinToString(":") else null
    }

    fun clear(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.activeNotifications.filter { it.tag?.startsWith(PREFIX) == true }.forEach { manager.cancel(it.tag, it.id) }
    }
}
