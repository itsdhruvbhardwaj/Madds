package com.itsdhruvbhardwaj.picme.notifications

import android.content.Context
import android.content.SharedPreferences
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.User
import org.junit.Assert.*
import org.junit.Test
import org.mockito.kotlin.*

class PushLocalStateTest {
    private val data = mutableMapOf<String, Any?>()
    private val preferences = mock<SharedPreferences>()
    private val editor = mock<SharedPreferences.Editor>()
    private val context = mock<Context>()
    private val auth = mock<AuthTokenStorage>()
    private fun state(): PushLocalState {
        whenever(context.getSharedPreferences(any(), any())).thenReturn(preferences)
        whenever(preferences.edit()).thenReturn(editor)
        whenever(preferences.getString(any(), anyOrNull())).thenAnswer { data[it.getArgument<String>(0)] as? String ?: it.getArgument<String?>(1) }
        whenever(preferences.getLong(any(), any())).thenAnswer { data[it.getArgument<String>(0)] as? Long ?: it.getArgument<Long>(1) }
        whenever(preferences.getStringSet(any(), anyOrNull())).thenAnswer { (data[it.getArgument<String>(0)] as? Set<*>)?.map { key -> key.toString() }?.toSet() ?: emptySet<String>() }
        whenever(editor.putString(any(), anyOrNull())).thenAnswer { data[it.getArgument(0)] = it.getArgument<String?>(1); editor }
        whenever(editor.putLong(any(), any())).thenAnswer { data[it.getArgument(0)] = it.getArgument<Long>(1); editor }
        whenever(editor.putStringSet(any(), anyOrNull())).thenAnswer { data[it.getArgument(0)] = it.getArgument<Set<String>?>(1)?.toSet(); editor }
        whenever(editor.remove(any())).thenAnswer { data.remove(it.getArgument<String>(0)); editor }
        whenever(editor.commit()).thenReturn(true)
        whenever(auth.getAccessToken()).thenReturn(access())
        whenever(auth.hasRefreshToken()).thenReturn(true)
        whenever(auth.getUser()).thenReturn(User(USER_A, "Tester", "test@example.com", true))
        return PushLocalState(context) { true }
    }
    private fun bind(state: PushLocalState) {
        val request = state.nextRequest("token"); state.accept(PushSession(USER_A, SESSION_A), request.bindingVersion)
        state.setPreferences(USER_A, mapOf("productUpdates" to true))
    }
    @Test fun `generation service messages ignore promotional opt outs but require a current binding`() {
        val state = state(); bind(state)
        state.setPreferences(USER_A, mapOf("productUpdates" to false, "offers" to false))
        assertTrue(state.serviceEligible(USER_A, 1, auth))
        assertFalse(state.serviceEligible(USER_B, 1, auth))
        assertFalse(state.serviceEligible(USER_A, 0, auth))
        assertFalse(state.serviceEligible(USER_A, 2, auth))
        state.invalidateAccount()
        assertFalse(state.serviceEligible(USER_A, 1, auth))
    }
    @Test fun `display ledger and account binding survive a new store instance`() {
        val state = state(); bind(state); val payload = PushPayload.parse(message())!!
        assertTrue(state.eligible(payload, auth))
        assertTrue(state.remember(message(), payload, PushSession(USER_A, SESSION_A)))
        val restored = PushLocalState(context) { true }
        assertFalse(restored.eligible(payload, auth))
        assertEquals(payload.deepLink, restored.tap(payload.deliveryId, auth)?.deepLink)
        restored.markOpened(payload.deliveryId)
        assertNull(restored.tap(payload.deliveryId, auth))
    }
    @Test fun `logout clears taps and rejects late delivery even before server detachment`() {
        val state = state(); bind(state); val payload = PushPayload.parse(message())!!
        state.remember(message(), payload, PushSession(USER_A, SESSION_A)); state.invalidateAccount()
        assertFalse(state.eligible(payload, auth)); assertNull(state.tap(payload.deliveryId, auth))
    }
    @Test fun `registration acknowledgements cannot restore an older account binding`() {
        val state = state(); val old = state.nextRequest("old-token"); state.invalidateAccount()
        state.accept(PushSession(USER_A, SESSION_A), old.bindingVersion)
        state.setPreferences(USER_A, mapOf("productUpdates" to true))
        assertFalse(state.eligible(PushPayload.parse(message())!!, auth))
    }
    @Test fun `same session refresh accepts queued versions but a new login rejects them`() {
        val state = state(); bind(state)
        val next = state.nextRequest("rotated-token"); state.accept(PushSession(USER_A, SESSION_A), next.bindingVersion)
        assertTrue(state.eligible(PushPayload.parse(message())!!, auth))
        state.invalidateAccount(); val login = state.nextRequest("new-token"); state.accept(PushSession(USER_A, SESSION_B), login.bindingVersion)
        whenever(auth.getAccessToken()).thenReturn(access(session = SESSION_B))
        assertFalse(state.eligible(PushPayload.parse(message())!!, auth))
    }
    @Test fun `offline opt out remains off until acknowledged and may be explicitly reenabled`() {
        val state = state(); bind(state); state.queueOff(USER_A, "productUpdates")
        state.setPreferences(USER_A, mapOf("productUpdates" to true))
        assertFalse(state.eligible(PushPayload.parse(message())!!, auth))
        state.acknowledgePreferences(USER_A, mapOf("productUpdates" to false))
        assertTrue(state.pendingOff(USER_A).isEmpty())
        state.queueOff(USER_A, "productUpdates")
        state.acknowledgePreferences(USER_A, mapOf("productUpdates" to true), setOf("productUpdates"))
        assertTrue(state.preferences(USER_A)["productUpdates"] == true)
    }
    @Test fun `a displayed tap survives a verified refresh but old incoming messages cannot display`() {
        val state = state(); bind(state); val payload = PushPayload.parse(message())!!
        state.remember(message(), payload, PushSession(USER_A, SESSION_A))
        state.rotateSession(PushSession(USER_A, SESSION_A), PushSession(USER_A, SESSION_B))
        whenever(auth.getAccessToken()).thenReturn(access(session = SESSION_B))
        assertEquals(payload.deepLink, state.tap(payload.deliveryId, auth)?.deepLink)
        assertFalse(state.eligible(payload, auth, false))
        state.invalidateAccount()
        assertNull(state.tap(payload.deliveryId, auth))
    }
}
