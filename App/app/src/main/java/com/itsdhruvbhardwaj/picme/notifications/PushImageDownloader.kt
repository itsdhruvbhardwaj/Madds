package com.itsdhruvbhardwaj.picme.notifications

import android.content.Context
import okhttp3.Cache
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URL
import java.util.concurrent.TimeUnit

/** Separate bounded HTTP cache retains the notification worker's streaming safety limits. */
internal class PushImageDownloader(
    private val client: OkHttpClient,
    private val validateUrl: (String) -> Boolean = ::isSafePushImage
) {
    fun load(url: String, stopped: () -> Boolean = { false }): ByteArray? = runCatching {
        var address = url
        val deadline = System.nanoTime() + 8_000_000_000L
        repeat(3) {
            require(validateUrl(address) && !stopped() && System.nanoTime() < deadline)
            client.newCall(Request.Builder().url(address).build()).execute().use { response ->
                if (response.code in 300..399) {
                    address = URL(URL(address), response.header("Location") ?: error("Missing redirect")).toString()
                } else {
                    val body = response.body ?: error("Missing image")
                    require(response.code == 200 && body.contentLength() <= MAX_BYTES)
                    body.byteStream().use { input ->
                        val output = ByteArrayOutputStream()
                        val buffer = ByteArray(8192)
                        while (true) {
                            require(!stopped() && System.nanoTime() < deadline)
                            val count = input.read(buffer)
                            if (count == -1) break
                            require(output.size() + count <= MAX_BYTES)
                            output.write(buffer, 0, count)
                        }
                        return@runCatching output.toByteArray()
                    }
                }
            }
        }
        error("Image redirect limit")
    }.getOrNull()

    companion object {
        private const val MAX_BYTES = 2_000_000
        @Volatile private var shared: PushImageDownloader? = null

        fun get(context: Context): PushImageDownloader = shared ?: synchronized(this) {
            shared ?: PushImageDownloader(OkHttpClient.Builder()
                .cache(Cache(File(context.applicationContext.cacheDir, "notification_image_cache"), 20L * 1024 * 1024))
                .connectTimeout(2500, TimeUnit.MILLISECONDS).readTimeout(2500, TimeUnit.MILLISECONDS)
                .callTimeout(8, TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false)
                .build()).also { shared = it }
        }
    }
}
