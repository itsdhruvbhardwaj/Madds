package com.itsdhruvbhardwaj.picme.utils

import org.junit.Assert.*
import org.junit.Test

class MainScreenAdTimerTest {
    @Test fun `background time does not count towards two minutes`() {
        val timer = MainScreenAdTimer()
        timer.enter(0)
        timer.leave(60_000)
        assertFalse(timer.isDue(900_000))
        timer.enter(900_000)
        assertFalse(timer.isDue(959_999))
        assertTrue(timer.isDue(960_000))
    }
    @Test fun `two minutes elapses without any navigation event`() {
        val timer = MainScreenAdTimer()
        timer.enter(0)
        assertFalse(timer.isDue(119_999))
        assertTrue(timer.isDue(120_000))
    }
    @Test fun `reset prevents rapid repeat ads while preserving next interval`() {
        val timer = MainScreenAdTimer()
        timer.enter(0)
        assertTrue(timer.isDue(120_000))
        timer.reset(120_000)
        assertFalse(timer.isDue(120_001))
        assertFalse(timer.isDue(239_999))
        assertTrue(timer.isDue(240_000))
    }
    @Test fun `screen changes cannot reset ongoing foreground usage`() {
        val timer = MainScreenAdTimer()
        timer.enter(0)
        timer.enter(60_000)
        timer.enter(120_000)
        assertTrue(timer.isDue(120_000))
    }
    @Test fun `due time remains due while waiting for an available ad`() {
        val timer = MainScreenAdTimer()
        timer.enter(0)
        assertTrue(timer.isDue(120_000))
        assertTrue(timer.isDue(130_000))
        timer.reset(130_000)
        assertFalse(timer.isDue(130_001))
        assertTrue(timer.isDue(250_000))
    }
}
