package com.itsdhruvbhardwaj.picme.notifications

import android.content.Context
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage

object PushPermissionGrant {
    fun onAllowed(context: Context) {
        val storage = AuthTokenStorage(context.applicationContext)
        val owner = storage.getUser()?.id?.takeIf { PushSession.fromToken(storage.getAccessToken())?.userId == it }
        PushLocalState(context.applicationContext).recordPermissionGrant(owner)
        PushSyncWorker.enqueue(context.applicationContext)
    }
}
