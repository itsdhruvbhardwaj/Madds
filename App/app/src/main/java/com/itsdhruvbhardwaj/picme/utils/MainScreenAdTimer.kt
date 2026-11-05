package com.itsdhruvbhardwaj.picme.utils

/** Counts foreground app usage across main screens and sub-screens. */
class MainScreenAdTimer(private val intervalMillis: Long = INTERVAL_MILLIS) {
    companion object { const val INTERVAL_MILLIS = 180_000L }
    private var accumulated = 0L
    private var startedAt: Long? = null

    fun enter(now: Long) { if (startedAt == null) startedAt = now }
    fun leave(now: Long) {
        startedAt?.let { accumulated += (now - it).coerceAtLeast(0) }
        startedAt = null
    }
    fun isDue(now: Long): Boolean = accumulated + (startedAt?.let { (now - it).coerceAtLeast(0) } ?: 0) >= intervalMillis
    fun reset(now: Long) {
        accumulated = 0
        if (startedAt != null) startedAt = now
    }
}
