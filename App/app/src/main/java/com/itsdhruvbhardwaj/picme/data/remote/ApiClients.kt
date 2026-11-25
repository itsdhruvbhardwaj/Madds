package com.itsdhruvbhardwaj.picme.data.remote

import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import okhttp3.Authenticator
import okhttp3.Dispatcher
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class ApiClients(tokenStorage: AuthTokenStorage, repository: () -> AuthRepository) {
    val content = OkHttpClient.Builder()
        .authenticator(AuthAuthenticator(tokenStorage, repository))
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .writeTimeout(25, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS).build()

    // newBuilder shares the dispatcher unless explicitly replaced. Refresh must
    // be able to run while every content slot is waiting inside Authenticator.
    val refresh = content.newBuilder().dispatcher(Dispatcher())
        .authenticator(Authenticator.NONE).build()

    val generation = content.newBuilder().dispatcher(Dispatcher())
        .readTimeout(180, TimeUnit.SECONDS).writeTimeout(120, TimeUnit.SECONDS)
        .callTimeout(180, TimeUnit.SECONDS).build()
}
