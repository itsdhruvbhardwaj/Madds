package com.itsdhruvbhardwaj.picme.utils

import org.junit.Assert.*
import org.junit.Test

class MainScreenAdTimerTest {
    @Test fun `background and subscreen time do not count`() {
        val timer = MainScreenAdTimer()
        timer.enter(0)
        timer.leave(100_000)
        assertFalse(timer.isDue(900_000))
        timer.enter(900_000)
        assertFalse(timer.isDue(919_999))
        assertTrue(timer.isDue(920_000))
    }
    @Test fun `reset prevents rapid repeat ads while preserving next interval`() {
        val timer = MainScreenAdTimer()
        timer.enter(0)
        assertFalse(timer.isDue(119_999))
        assertTrue(timer.isDue(120_000))
        timer.reset(120_000)
        assertFalse(timer.isDue(120_001))
        assertFalse(timer.isDue(239_999))
        assertTrue(timer.isDue(240_000))
    }
    @Test fun `repeated entry cannot reset active usage`() {
        val timer = MainScreenAdTimer()
        timer.enter(0)
        timer.enter(60_000)
        assertTrue(timer.isDue(120_000))
    }
}
