package com.itsdhruvbhardwaj.picme.data.local

import android.content.Context
import com.google.gson.Gson
import java.util.UUID

const val ENGAGEMENT_ACTIVE_MS = 600_000L
const val ENGAGEMENT_WEEK_MS = 7 * 86_400_000L

data class EngagementProgress(
    val activeMillis: Long = 0,
    val sessions: Int = 0,
    val lastSession: String? = null,
    val prompts: Int = 0,
    val nextCheckAt: Long = 0,
    val stopped: Boolean = false,
    val pendingClaim: String? = null,
    val responsePrompt: String? = null,
    val responseAction: String? = null
) {
    fun eligible(now: Long) = !stopped && prompts < 2 && activeMillis >= ENGAGEMENT_ACTIVE_MS && sessions >= 2 && now >= nextCheckAt
    fun beginSession(id: String) = if (sessions >= 2 || lastSession == id) this else copy(sessions = sessions + 1, lastSession = id)
    fun addUsage(millis: Long) = copy(activeMillis = (activeMillis + millis.coerceAtLeast(0)).coerceAtMost(ENGAGEMENT_ACTIVE_MS))
    fun respond(id: String, action: String, now: Long) = copy(stopped = stopped || action in listOf("RATE", "OPT_OUT"),
        nextCheckAt = now + ENGAGEMENT_WEEK_MS, responsePrompt = id, responseAction = action)
}

/** A foreground return after 30 minutes is a new session; rotations and short ad pauses are not. */
class EngagementSessionClock {
    private var id = UUID.randomUUID().toString()
    private var pausedAt: Long? = null
    fun resume(now: Long): String {
        pausedAt?.let { if (now - it >= 30 * 60_000) id = UUID.randomUUID().toString() }
        pausedAt = null
        return id
    }
    fun pause(now: Long) { pausedAt = now }
}
object AppEngagementSession { val clock = EngagementSessionClock() }

class EngagementStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("madds_engagement", Context.MODE_PRIVATE)
    private val gson = Gson()
    fun read(userId: String): EngagementProgress = runCatching {
        prefs.getString(userId, null)?.let { gson.fromJson(it, EngagementProgress::class.java) } ?: EngagementProgress()
    }.getOrDefault(EngagementProgress())
    fun write(userId: String, state: EngagementProgress) { prefs.edit().putString(userId, gson.toJson(state)).apply() }
    fun change(userId: String, transform: (EngagementProgress) -> EngagementProgress): EngagementProgress = synchronized(lock) {
        val current = read(userId)
        transform(current).also { if (it != current) write(userId, it) }
    }
    fun durableChange(userId: String, transform: (EngagementProgress) -> EngagementProgress): Boolean = synchronized(lock) {
        prefs.edit().putString(userId, gson.toJson(transform(read(userId)))).commit()
    }
    fun feedbackSubmitted(userId: String) { durableChange(userId) { it.copy(stopped = true, responseAction = null, responsePrompt = null) } }
    companion object { private val lock = Any() }
}
