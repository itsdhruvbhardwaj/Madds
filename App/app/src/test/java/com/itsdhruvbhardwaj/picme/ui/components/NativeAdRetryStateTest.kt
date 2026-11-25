package com.itsdhruvbhardwaj.picme.ui.components

import org.junit.Assert.*
import org.junit.Test

class NativeAdRetryStateTest {
    @Test fun `failures retry after ten twenty and forty seconds then stop`() {
        val state = NativeAdRetryState()
        var now = 0L
        for (gap in listOf(10_000L, 20_000L, 40_000L)) {
            assertTrue(state.canStart(now))
            state.start(now)
            assertFalse(state.canStart(now))
            state.failed(now)
            assertFalse(state.canStart(now + gap - 1))
            now += gap
            assertTrue(state.canStart(now))
        }
        state.start(now); state.failed(now)
        assertFalse(state.canStart(now + 86_400_000))
    }
    @Test fun `loading cannot overlap and stalled requests time out`() {
        val state = NativeAdRetryState()
        state.start(100)
        assertFalse(state.canStart(44_000))
        assertFalse(state.timedOut(45_099))
        assertTrue(state.timedOut(45_100))
        state.failed(45_100)
        assertFalse(state.canStart(55_099))
        assertTrue(state.canStart(55_100))
    }
    @Test fun `success resets failures but permanent request errors do not retry`() {
        val state = NativeAdRetryState()
        state.start(0); state.failed(0)
        state.start(10_000); state.succeeded()
        state.start(20_000); state.failed(20_000)
        assertTrue(state.canStart(30_000))
        state.start(30_000); state.failed(30_000, permanent = true)
        assertFalse(state.canStart(1_000_000))
    }
}
