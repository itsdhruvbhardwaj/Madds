package com.itsdhruvbhardwaj.picme.notifications

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import android.util.Log
import com.itsdhruvbhardwaj.picme.BuildConfig

class MaddsMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        // Campaigns are data-only so an old account's message cannot auto-display.
        if (BuildConfig.DEBUG) Log.d("MaddsPush", "FCM message received")
        runCatching {
            if (message.data["type"] == "GENERATION_STATUS") GenerationNotifications.receive(applicationContext, message.data)
            else PushNotifications.receive(applicationContext, message.data)
        }.onFailure {
            // No payload, account identifiers, tokens or exception messages in logs.
            if (BuildConfig.DEBUG) Log.w("MaddsPush", "Receiver failed: ${it.javaClass.simpleName}")
        }
    }
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        PushRegistration.updateToken(token)
        PushSyncWorker.enqueue(applicationContext)
    }
}
