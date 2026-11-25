package com.itsdhruvbhardwaj.picme.data.model

import org.junit.Assert.*
import org.junit.Test

class GenerationExpiryTest {
    @Test fun `expiry parses UTC independently of device timezone and rejects invalid dates`() {
        val previous = java.util.TimeZone.getDefault()
        try {
            java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Asia/Kolkata"))
            assertEquals(0L, generationExpiry("1970-01-01T00:00:00.000Z"))
            assertEquals(0L, generationExpiry("1970-01-01T00:00:00Z"))
            assertNull(generationExpiry("2026-02-30T00:00:00.000Z"))
            assertNull(generationExpiry("2026-11-15T00:00:00.000Zextra"))
            assertNull(generationExpiry(null))
        } finally { java.util.TimeZone.setDefault(previous) }
    }
    @Test fun `countdown is bounded at expiry and rounds up the remaining minute`() {
        assertEquals("24h 0m left", generationTimeLeft(86400000, 0))
        assertEquals("1m left", generationTimeLeft(1, 0))
        assertEquals("Expired", generationTimeLeft(0, 0))
        assertEquals("Expired", generationTimeLeft(0, 1000))
    }
}
