package com.itsdhruvbhardwaj.picme.data.local

import android.content.Context
import android.content.SharedPreferences
import org.junit.Assert.*
import org.junit.Test
import org.mockito.kotlin.*

class EngagementStoreTest {
    @Test fun `needs ten active minutes across two sessions`() {
        val first = EngagementProgress().beginSession("first").addUsage(ENGAGEMENT_ACTIVE_MS)
        assertFalse(first.eligible(0))
        assertFalse(first.beginSession("first").eligible(0))
        assertTrue(first.beginSession("second").eligible(0))
        assertFalse(first.beginSession("second").copy(activeMillis = ENGAGEMENT_ACTIVE_MS - 1).eligible(0))
    }
    @Test fun `foreground accumulation is bounded and ignores negative deltas`() {
        assertEquals(0L, EngagementProgress().addUsage(-10).activeMillis)
        assertEquals(ENGAGEMENT_ACTIVE_MS, EngagementProgress().addUsage(10000000).activeMillis)
    }
    @Test fun `dismissal and opening feedback wait exactly one week without stopping forever`() {
        for (action in listOf("DISMISS", "FEEDBACK")) {
            val state = EngagementProgress(activeMillis = ENGAGEMENT_ACTIVE_MS, sessions = 2).respond("id", action, 1000)
            assertFalse(state.stopped)
            assertFalse(state.eligible(1000 + ENGAGEMENT_WEEK_MS - 1))
            assertTrue(state.eligible(1000 + ENGAGEMENT_WEEK_MS))
        }
    }
    @Test fun `rate and opt out stop future prompts and two prompts is the limit`() {
        val eligible = EngagementProgress(activeMillis = ENGAGEMENT_ACTIVE_MS, sessions = 2)
        for (action in listOf("RATE", "OPT_OUT")) assertFalse(eligible.respond("id", action, 0).eligible(Long.MAX_VALUE))
        assertFalse(eligible.copy(prompts = 2).eligible(Long.MAX_VALUE))
    }
    @Test fun `rotation and short ad pauses do not count as a new session`() {
        val clock = EngagementSessionClock()
        val first = clock.resume(0)
        clock.pause(10000)
        assertEquals(first, clock.resume(20000))
        clock.pause(20000)
        assertNotEquals(first, clock.resume(20000 + 30 * 60000))
    }
    @Test fun `preferences are scoped by account and completion is durable`() {
        val context = mock<Context>()
        val prefs = mock<SharedPreferences>()
        val editor = mock<SharedPreferences.Editor>()
        val values = mutableMapOf<String, String>()
        whenever(context.applicationContext).thenReturn(context)
        whenever(context.getSharedPreferences(any(), any())).thenReturn(prefs)
        whenever(prefs.edit()).thenReturn(editor)
        whenever(prefs.getString(any(), isNull())).thenAnswer { values[it.getArgument(0)] }
        whenever(editor.putString(any(), any())).thenAnswer { values[it.getArgument(0)] = it.getArgument(1); editor }
        whenever(editor.commit()).thenReturn(true)
        val store = EngagementStore(context)
        store.change("one") { it.beginSession("session").addUsage(ENGAGEMENT_ACTIVE_MS) }
        assertEquals(0L, store.read("two").activeMillis)
        store.feedbackSubmitted("one")
        assertTrue(store.read("one").stopped)
        assertFalse(store.read("two").stopped)
        verify(editor).commit()
        assertTrue(EngagementStore(context).read("one").stopped)
    }
}
