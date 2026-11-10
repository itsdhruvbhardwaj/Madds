package com.itsdhruvbhardwaj.picme.utils

import org.junit.Assert.*
import org.junit.Test

class InterstitialGateTest {
    @Test fun `at least two actions required before first ad`() {
        val gate=InterstitialGate()
        gate.action();assertFalse(gate.allowed(0,90))
        gate.action();assertTrue(gate.allowed(0,90))
    }
    @Test fun `different placements share time and action spacing`() {
        val gate=InterstitialGate()
        gate.action();gate.action();gate.shown(1000)
        gate.action();gate.action()
        assertFalse(gate.allowed(90_999,90));assertTrue(gate.allowed(91_000,90))
        gate.shown(91_000);gate.action()
        assertFalse(gate.allowed(1_000_000,90))
    }
    @Test fun `remote timing change takes effect without resetting gate`() {
        val gate=InterstitialGate();gate.shown(0);gate.action();gate.action()
        assertFalse(gate.allowed(120_000,180));assertTrue(gate.allowed(120_000,60))
    }
    @Test fun `automatic timer does not need navigation but respects shared spacing`() {
        val gate=InterstitialGate()
        assertTrue(gate.allowed(120_000,90,requireActions=false))
        gate.shown(120_000)
        assertFalse(gate.allowed(209_999,90,requireActions=false))
        assertTrue(gate.allowed(210_000,90,requireActions=false))
        assertFalse(gate.allowed(210_000,90))
        assertEquals(120,AdConfig().timedIntervalSeconds)
    }
    @Test fun `master and individual switches independently gate placements`() {
        val config=AdConfig(placements=AdPlacement.entries.associate{it.key to true})
        assertTrue(config.allows(AdPlacement.AVATAR_SAVED))
        assertFalse(config.copy(enabled=false).allows(AdPlacement.AVATAR_SAVED))
        assertFalse(config.copy(placements=config.placements+ (AdPlacement.AVATAR_SAVED.key to false)).allows(AdPlacement.AVATAR_SAVED))
        assertTrue(config.copy(placements=config.placements+ (AdPlacement.AVATAR_SAVED.key to false)).allows(AdPlacement.HOME_SEE_ALL))
    }
    @Test fun `usage timer honors changed interval and excludes background time`() {
        val timer=MainScreenAdTimer();timer.enter(0);timer.leave(70_000)
        assertTrue(timer.isDue(900_000,60_000));assertFalse(timer.isDue(900_000,180_000))
    }
}
