package com.itsdhruvbhardwaj.picme.data.remote

import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import com.sun.net.httpserver.HttpServer
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Request
import okhttp3.Response
import org.junit.Assert.*
import org.junit.Test
import org.mockito.kotlin.*
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.io.IOException
import java.net.InetSocketAddress
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

class ApiClientsTest {
    @Test
    fun `expired parallel requests refresh once even when all content slots are occupied`() {
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        val refreshes = AtomicInteger()
        server.createContext("/") { exchange ->
            val refresh = exchange.requestURI.path == "/api/auth/refresh"
            val authorized = exchange.requestHeaders.getFirst("Authorization") == "Bearer new-access"
            val json = if (refresh) {
                refreshes.incrementAndGet()
                """{"ok":true,"accessToken":"new-access","refreshToken":"new-refresh"}"""
            } else "{}"
            exchange.responseHeaders.add("Content-Type", "application/json")
            exchange.sendResponseHeaders(if (refresh || authorized) 200 else 401, json.toByteArray().size.toLong())
            exchange.responseBody.use { it.write(json.toByteArray()) }
        }
        server.start()
        val access = AtomicReference("old-access")
        val refresh = AtomicReference("old-refresh")
        val storage = mock<AuthTokenStorage>()
        whenever(storage.getAccessToken()).thenAnswer { access.get() }
        whenever(storage.getRefreshToken()).thenAnswer { refresh.get() }
        doAnswer { access.set(it.getArgument(0)); refresh.set(it.getArgument(1)); null }
            .whenever(storage).saveRefreshedTokens(any(), any())
        lateinit var repository: AuthRepository
        val clients = ApiClients(storage) { repository }
        clients.content.dispatcher.maxRequestsPerHost = 1
        val retrofit = Retrofit.Builder().baseUrl("http://127.0.0.1:${server.address.port}/")
            .client(clients.content).addConverterFactory(GsonConverterFactory.create()).build()
        repository = AuthRepository(retrofit.create(AuthApiService::class.java), storage,
            retrofit.newBuilder().client(clients.refresh).build().create(AuthApiService::class.java))
        val done = CountDownLatch(5)
        val successes = AtomicInteger()
        try {
            repeat(5) {
                clients.content.newCall(Request.Builder().url("${retrofit.baseUrl()}api/styles")
                    .header("Authorization", "Bearer old-access").build()).enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) { done.countDown() }
                    override fun onResponse(call: Call, response: Response) {
                        response.use { if (it.isSuccessful) successes.incrementAndGet() }
                        done.countDown()
                    }
                })
            }
            assertTrue("Refresh deadlocked behind content requests", done.await(10, TimeUnit.SECONDS))
            assertEquals(5, successes.get())
            assertEquals("Old queued tokens must reuse the refreshed session", 1, refreshes.get())
        } finally {
            clients.content.dispatcher.cancelAll()
            clients.refresh.dispatcher.cancelAll()
            server.stop(0)
            clients.content.dispatcher.executorService.shutdownNow()
            clients.refresh.dispatcher.executorService.shutdownNow()
        }
    }
}
