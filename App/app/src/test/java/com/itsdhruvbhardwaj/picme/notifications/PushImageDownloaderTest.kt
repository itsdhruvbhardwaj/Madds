package com.itsdhruvbhardwaj.picme.notifications

import com.sun.net.httpserver.HttpServer
import okhttp3.Cache
import okhttp3.OkHttpClient
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.net.InetSocketAddress
import java.util.concurrent.atomic.AtomicInteger

class PushImageDownloaderTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test fun `fresh notification image is reused across downloader recreation and offline`() {
        val hits = AtomicInteger()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val bytes = "cached image".toByteArray()
        server.createContext("/image") { exchange ->
            hits.incrementAndGet()
            exchange.responseHeaders.add("Cache-Control", "private, max-age=86400, immutable")
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        val url = "http://127.0.0.1:${server.address.port}/image?v=1"
        val directory = temporary.newFolder()
        val first = OkHttpClient.Builder().cache(Cache(directory, 1024 * 1024)).build()
        try {
            assertArrayEquals(bytes, PushImageDownloader(first) { true }.load(url))
            first.cache!!.close()
            server.stop(0)
            val second = OkHttpClient.Builder().cache(Cache(directory, 1024 * 1024)).build()
            try {
                assertArrayEquals(bytes, PushImageDownloader(second) { true }.load(url))
                assertEquals(1, hits.get())
            } finally { second.cache!!.close() }
        } finally { server.stop(0); first.connectionPool.evictAll() }
    }

    @Test fun `no-store is respected and changed version URLs remain separate`() {
        val hits = AtomicInteger()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/") { exchange ->
            hits.incrementAndGet()
            exchange.responseHeaders.add("Cache-Control", if (exchange.requestURI.path == "/private") "no-store" else "max-age=3600")
            val bytes = exchange.requestURI.toString().toByteArray()
            exchange.sendResponseHeaders(200, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        val client = OkHttpClient.Builder().cache(Cache(temporary.newFolder(), 1024 * 1024)).build()
        val base = "http://127.0.0.1:${server.address.port}"
        val downloader = PushImageDownloader(client) { true }
        try {
            downloader.load("$base/private"); downloader.load("$base/private")
            assertEquals(2, hits.get())
            assertArrayEquals("/image?v=1".toByteArray(), downloader.load("$base/image?v=1"))
            assertArrayEquals("/image?v=2".toByteArray(), downloader.load("$base/image?v=2"))
            downloader.load("$base/image?v=1")
            assertEquals(4, hits.get())
        } finally { client.cache!!.close(); server.stop(0) }
    }

    @Test fun `unsafe URLs and cancelled work do not make network requests`() {
        val client = OkHttpClient()
        assertNull(PushImageDownloader(client).load("http://example.com/image"))
        assertNull(PushImageDownloader(client).load("https://example.com/image") { true })
    }
}
