package com.itsdhruvbhardwaj.picme.notifications

import android.content.Context
import android.app.NotificationManager
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage

/** Installation state is explicitly excluded from backup and device transfer. */
class PushLocalState(private val context: Context, private val notificationPermission: () -> Boolean = { PushNotifications.permissionGranted(context) }) {
    private val prefs = context.getSharedPreferences("madds_push_installation", Context.MODE_PRIVATE)
    private val gson = Gson()
    companion object { val lock = Any(); const val TAG_PREFIX = "madds-push:" }

    fun nextRequest(token: String? = null): PushDeviceRequest = synchronized(lock) {
        val id = prefs.getString("device_id", null) ?: java.util.UUID.randomUUID().toString()
        val version = prefs.getLong("revision", 0) + 1
        check(prefs.edit().putString("device_id", id).putLong("revision", version).commit())
        PushDeviceRequest(id, version, token, notificationPermission())
    }

    fun accept(session: PushSession, version: Long) = synchronized(lock) {
        if (prefs.getLong("revision", 0) != version) return@synchronized
        val same = boundSession() == session
        check(prefs.edit().putString("bound_user", session.userId).putString("bound_session", session.sessionId)
            .putLong("first_version", if (same) prefs.getLong("first_version", version) else version)
            .putLong("last_version", version).commit())
    }

    private fun boundSession(): PushSession? {
        val user = prefs.getString("bound_user", null) ?: return null
        val session = prefs.getString("bound_session", null) ?: return null
        return PushSession(user, session)
    }

    fun preferences(userId: String): Map<String, Boolean> = synchronized(lock) {
        runCatching { gson.fromJson<Map<String, Boolean>>(prefs.getString("categories_$userId", "{}"),
            object : TypeToken<Map<String, Boolean>>() {}.type).orEmpty() }.getOrDefault(emptyMap()) + pendingOff(userId)
    }

    fun setPreferences(userId: String, values: Map<String, Boolean>) = synchronized(lock) {
        val filtered = PushCategory.entries.associate { it.key to (values[it.key] == true) }
        check(prefs.edit().putString("categories_$userId", gson.toJson(filtered)).commit())
        cancelNotifications { category -> filtered[category] != true }
    }

    fun pendingOff(userId: String): Map<String, Boolean> = synchronized(lock) {
        prefs.getStringSet("pending_off_$userId", emptySet()).orEmpty().associateWith { false }
    }
    fun queueOff(userId: String, category: String) = synchronized(lock) {
        val keys = pendingOff(userId).keys + category
        check(prefs.edit().putStringSet("pending_off_$userId", keys).commit())
    }
    fun acknowledgePreferences(userId: String, values: Map<String, Boolean>, explicitlyChanged: Set<String> = emptySet()) = synchronized(lock) {
        val pending = pendingOff(userId).keys.filter { values[it] != false && it !in explicitlyChanged }.toSet()
        check(prefs.edit().putStringSet("pending_off_$userId", pending).commit())
        setPreferences(userId, values + pending.associateWith { false })
    }

    fun invalidateAccount() = synchronized(lock) {
        prefs.edit().remove("bound_user").remove("bound_session").remove("first_version")
            .remove("last_version").remove("deliveries").putLong("revision", prefs.getLong("revision", 0) + 1).commit()
        cancelNotifications { true }
        GenerationNotifications.clear(context)
    }

    private data class Seen(val data: Map<String, String>, val time: Long, val sessionId: String, val opened: Boolean = false)
    private fun deliveries(): LinkedHashMap<String, Seen> = runCatching {
        gson.fromJson<LinkedHashMap<String, Seen>>(prefs.getString("deliveries", "{}"),
            object : TypeToken<LinkedHashMap<String, Seen>>() {}.type) ?: linkedMapOf()
    }.getOrDefault(linkedMapOf())

    /** Preserve already displayed taps only across an authenticated same-account refresh. */
    fun rotateSession(previous: PushSession, next: PushSession) = synchronized(lock) {
        if (previous.userId != next.userId) { invalidateAccount(); return@synchronized }
        val seen = deliveries()
        seen.entries.forEach { entry ->
            if (entry.value.sessionId == previous.sessionId && entry.value.data["recipientUserId"] == next.userId)
                entry.setValue(entry.value.copy(sessionId = next.sessionId))
        }
        prefs.edit().remove("bound_user").remove("bound_session").remove("first_version").remove("last_version")
            .putLong("revision", prefs.getLong("revision", 0) + 1).putString("deliveries", gson.toJson(seen)).commit()
    }

    fun eligible(payload: PushPayload, auth: AuthTokenStorage, checkSeen: Boolean = true): Boolean = synchronized(lock) {
        val user = auth.getUser()
        user?.isActive == true && user.emailVerified && canReceivePush(payload,
            PushSession.fromToken(auth.getAccessToken()), user.id, boundSession(),
            prefs.getLong("first_version", 0), prefs.getLong("last_version", 0),
            preferences(user.id)[payload.category.key] == true, auth.hasRefreshToken(),
            checkSeen && deliveries().containsKey(payload.deliveryId))
    }

    fun serviceEligible(owner: String, version: Long, auth: AuthTokenStorage): Boolean = synchronized(lock) {
        val session = PushSession.fromToken(auth.getAccessToken())
        val user = auth.getUser()
        session != null && session == boundSession() && session.userId == owner && user?.id == owner &&
            user.isActive && user.emailVerified && auth.hasRefreshToken() &&
            version >= prefs.getLong("first_version", 0) && version <= prefs.getLong("last_version", 0) &&
            prefs.getLong("first_version", 0) > 0
    }

    /** Boolean diagnostics only: never expose account identifiers or tokens. */
    fun diagnosticStatus(payload: PushPayload, auth: AuthTokenStorage): String = synchronized(lock) {
        val user = auth.getUser()
        val session = PushSession.fromToken(auth.getAccessToken())
        "user=${user != null}, active=${user?.isActive}, verified=${user?.emailVerified}, " +
            "session=${session != null}, bound=${session != null && session == boundSession()}, " +
            "account=${session?.userId == user?.id && session?.userId == payload.userId}, " +
            "revision=${prefs.getLong("first_version", 0) > 0 && payload.bindingVersion in prefs.getLong("first_version", 0)..prefs.getLong("last_version", 0)}, " +
            "optedIn=${user != null && preferences(user.id)[payload.category.key] == true}, " +
            "refresh=${auth.hasRefreshToken()}, seen=${deliveries().containsKey(payload.deliveryId)}"
    }

    fun remember(data: Map<String, String>, payload: PushPayload, session: PushSession): Boolean = synchronized(lock) {
        val seen = deliveries()
        val cutoff = System.currentTimeMillis() - 7 * 86_400_000L
        seen.entries.removeAll { it.value.time < cutoff }
        if (seen.containsKey(payload.deliveryId)) return@synchronized false
        seen[payload.deliveryId] = Seen(data, System.currentTimeMillis(), session.sessionId)
        while (seen.size > 1000) seen.remove(seen.keys.first())
        prefs.edit().putString("deliveries", gson.toJson(seen)).commit()
    }

    fun tap(id: String, auth: AuthTokenStorage): PushPayload? = synchronized(lock) {
        val seen = deliveries()[id] ?: return@synchronized null
        val payload = PushPayload.parse(seen.data) ?: return@synchronized null
        val session = PushSession.fromToken(auth.getAccessToken()); val user = auth.getUser()
        if (session == null || user == null || seen.opened || seen.time < System.currentTimeMillis() - 7 * 86_400_000L ||
            session.sessionId != seen.sessionId || session.userId != payload.userId || user.id != payload.userId ||
            !user.isActive || !user.emailVerified || !auth.hasRefreshToken() || preferences(payload.userId)[payload.category.key] != true) null else payload
    }

    fun markOpened(id: String) = synchronized(lock) {
        val seen = deliveries(); val item = seen[id] ?: return@synchronized
        seen[id] = item.copy(opened = true); prefs.edit().putString("deliveries", gson.toJson(seen)).commit()
    }

    fun cancelNotifications(predicate: (String?) -> Boolean) {
      runCatching {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.activeNotifications.filter { it.tag?.startsWith(TAG_PREFIX) == true &&
            predicate(it.notification.extras.getString("madds_category")) }.forEach { manager.cancel(it.tag, it.id) }
      }
    }
}
