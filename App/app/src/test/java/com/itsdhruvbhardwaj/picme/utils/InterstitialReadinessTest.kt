package com.itsdhruvbhardwaj.picme.utils

import org.junit.Assert.*
import org.junit.Test

class InterstitialReadinessTest {
    @Test fun `one request at a time and fresh cache prevents another request`() {
        val state=InterstitialReadiness();val ticket=state.begin(0)!!
        assertNull(state.begin(1));assertTrue(state.loaded(ticket,100))
        assertTrue(state.ready(101));assertNull(state.begin(102))
        state.consume();assertFalse(state.ready(103));assertNotNull(state.begin(104))
    }
    @Test fun `cache expires before one hour and is never reported ready`() {
        val state=InterstitialReadiness();state.loaded(state.begin(0)!!,100)
        assertTrue(state.ready(100+InterstitialReadiness.CACHE_TTL_MS-1))
        assertFalse(state.ready(100+InterstitialReadiness.CACHE_TTL_MS))
        assertTrue(state.expire(100+InterstitialReadiness.CACHE_TTL_MS))
        assertNotNull(state.begin(100+InterstitialReadiness.CACHE_TTL_MS))
    }
    @Test fun `watchdog clears stuck loading and late callback cannot replace new cache`() {
        val state=InterstitialReadiness();val old=state.begin(0)!!
        assertFalse(state.timeout(59_999));assertTrue(state.timeout(60_000))
        assertNull(state.activeRequest);assertNull(state.begin(89_999))
        val fresh=state.begin(90_000)!!
        assertFalse(state.loaded(old,90_001));assertFalse(state.failed(old,90_002,InterstitialFailure.NETWORK))
        assertTrue(state.loaded(fresh,90_003));assertTrue(state.ready(90_004))
    }
    @Test fun `no fill backs off exponentially and does not bypass wait when network changes`() {
        val state=InterstitialReadiness();var now=0L
        for(wait in listOf(30_000L,60_000L,120_000L,240_000L,300_000L,300_000L)) {
            state.failed(state.begin(now)!!,now,InterstitialFailure.NO_FILL)
            assertEquals(now+wait,state.retryAt);state.connectivityRestored(now+1)
            assertNull(state.begin(now+wait-1));now+=wait
        }
    }
    @Test fun `network recovery retries promptly only for network errors`() {
        val state=InterstitialReadiness();state.failed(state.begin(0)!!,1,InterstitialFailure.NETWORK)
        assertNull(state.begin(2));state.connectivityRestored(3);assertNotNull(state.begin(3))
    }
    @Test fun `successful load resets failure backoff`() {
        val state=InterstitialReadiness();state.failed(state.begin(0)!!,0,InterstitialFailure.NO_FILL)
        state.loaded(state.begin(30_000)!!,30_010);state.consume()
        state.failed(state.begin(30_020)!!,30_020,InterstitialFailure.NO_FILL)
        assertEquals(60_020L,state.retryAt)
    }
    @Test fun `disable invalidates an outstanding request`() {
        val state=InterstitialReadiness();val old=state.begin(0)!!;state.clear()
        assertFalse(state.loaded(old,1));assertNull(state.loadedAt)
        val fresh=state.begin(2)!!;assertTrue(fresh>old);assertTrue(state.loaded(fresh,3))
    }
    @Test fun `failed presentation retries without consuming the display cooldown`() {
        val state=InterstitialReadiness();val gate=InterstitialGate();gate.action();gate.action()
        state.loaded(state.begin(0)!!,1);state.consume();state.showFailed(2)
        assertNull(state.begin(30_001));assertNotNull(state.begin(30_002))
        assertTrue(gate.allowed(3,90)) // Only a real SDK display records gate.shown().
    }
    @Test fun `diagnostic gate reasons distinguish cooldown from action spacing`() {
        val gate=InterstitialGate();assertEquals("ACTION_SPACING",gate.blockedReason(0,90))
        gate.action();gate.action();assertNull(gate.blockedReason(0,90));gate.shown(0)
        assertEquals("COOLDOWN",gate.blockedReason(1000,90))
        assertEquals("ACTION_SPACING",gate.blockedReason(90_000,90))
    }
}
