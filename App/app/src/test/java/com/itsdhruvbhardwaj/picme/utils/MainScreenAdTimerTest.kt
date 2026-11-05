package com.itsdhruvbhardwaj.picme.utils

import org.junit.Assert.*
import org.junit.Test

class MainScreenAdTimerTest {
    @Test fun `background time does not count towards three minutes`() {
        val timer = MainScreenAdTimer()
        timer.enter(0)
        timer.leave(100_000)
        assertFalse(timer.isDue(900_000))
        timer.enter(900_000)
        assertFalse(timer.isDue(979_999))
        assertTrue(timer.isDue(980_000))
    }
    @Test fun `three minutes elapses without any navigation event`() {
        val timer = MainScreenAdTimer()
        timer.enter(0)
        assertFalse(timer.isDue(179_999))
        assertTrue(timer.isDue(180_000))
    }
    @Test fun `reset prevents rapid repeat ads while preserving next interval`() {
        val timer = MainScreenAdTimer()
        timer.enter(0)
        assertTrue(timer.isDue(180_000))
        timer.reset(180_000)
        assertFalse(timer.isDue(180_001))
        assertFalse(timer.isDue(359_999))
        assertTrue(timer.isDue(360_000))
    }
    @Test fun `screen changes cannot reset ongoing foreground usage`() {
        val timer = MainScreenAdTimer()
        timer.enter(0)
        timer.enter(60_000)
        timer.enter(120_000)
        assertTrue(timer.isDue(180_000))
    }
    @Test fun `due time remains due while waiting for an available ad`() {
        val timer = MainScreenAdTimer()
        timer.enter(0)
        assertTrue(timer.isDue(180_000))
        assertTrue(timer.isDue(190_000))
        timer.reset(190_000)
        assertFalse(timer.isDue(190_001))
        assertTrue(timer.isDue(370_000))
    }
}
