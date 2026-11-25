package com.itsdhruvbhardwaj.picme.notifications

import android.content.Context
import androidx.annotation.Keep
import androidx.work.*
import com.google.android.gms.tasks.Tasks
import com.google.firebase.messaging.FirebaseMessaging
import com.itsdhruvbhardwaj.picme.BuildConfig
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.remote.AuthApiService
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

@Keep
class PushSyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result = runBlocking {
        try {
            val storage = AuthTokenStorage(applicationContext)
            val user = storage.getUser() ?: return@runBlocking Result.success()
            if (!storage.hasRefreshToken()) return@runBlocking Result.success()
            val client = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).connectTimeout(15, TimeUnit.SECONDS).build()
            val retrofit = Retrofit.Builder().baseUrl(BuildConfig.BACKEND_BASE_URL).client(client)
                .addConverterFactory(GsonConverterFactory.create()).build()
            val api = retrofit.create(AuthApiService::class.java)
            val auth = AuthRepository(api, storage, api)
            val preferences = PushPreferencesRepository(applicationContext, retrofit, storage, auth)
            // Persist Allow before attempting Firebase; token acquisition may fail independently.
            if (preferences.load(user.id).isFailure) return@runBlocking if (runAttemptCount < 5) Result.retry() else Result.failure()
            val token = Tasks.await(FirebaseMessaging.getInstance().token, 15, TimeUnit.SECONDS)
            if (PushDeviceSync(applicationContext, retrofit, storage, auth, preferences).syncOnce(user.id, token)) Result.success()
            else if (runAttemptCount < 5) Result.retry() else Result.failure()
        } catch (_: Exception) { if (runAttemptCount < 5) Result.retry() else Result.failure() }
    }
    companion object {
        fun enqueue(context: Context) {
            runCatching { WorkManager.getInstance(context).enqueueUniqueWork("madds-push-registration", ExistingWorkPolicy.REPLACE,
                OneTimeWorkRequest.Builder(PushSyncWorker::class.java)
                    .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES).build()) }
        }
    }
}
