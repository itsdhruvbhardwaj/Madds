package com.itsdhruvbhardwaj.picme.ui.components

/** One initial request plus three retries. Visibility changes cannot reset this budget. */
internal class NativeAdRetryState {
    var loading = false; private set
    private var startedAt = 0L
    private var failures = 0
    private var retryAt = 0L
    fun canStart(now: Long) = !loading && now >= retryAt
    fun start(now: Long) { loading = true; startedAt = now }
    fun timedOut(now: Long) = loading && now - startedAt >= 45_000L
    fun failed(now: Long, permanent: Boolean = false) {
        loading = false
        failures++
        retryAt = if (permanent || failures > 3) Long.MAX_VALUE else now + 10_000L * (1L shl (failures - 1))
    }
    fun succeeded() { loading = false; failures = 0; retryAt = 0 }
}
