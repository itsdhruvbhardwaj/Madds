package com.itsdhruvbhardwaj.picme.notifications

import org.junit.Assert.*
import org.junit.Test

class GenerationReadyGateTest {
    private val id = "6aea074afb8cb4bbdd350b96"
    private val other = "6aea074afb8cb4bbdd350b97"

    @Test fun `viewing a result suppresses late alerts after leaving the screen`() {
        val gate = GenerationReadyGate()
        gate.watch("owner", id)
        gate.imageDisplayed("owner", id)
        gate.watch(null, null)
        assertTrue(gate.hasDisplayed("owner", id))
        assertFalse(gate.hasDisplayed("owner", other))
        assertFalse(gate.hasDisplayed("different-owner", id))
    }

    @Test fun `completion waits until focused image is displayed`() {
        val gate = GenerationReadyGate()
        gate.watch("owner", id)
        assertTrue(gate.shouldDefer("owner", id))
        gate.imageDisplayed("owner", id)
        assertFalse(gate.shouldDefer("owner", id))
        gate.watch("owner", id)
        assertFalse(gate.shouldDefer("owner", id))
    }
    @Test fun `background and unrelated operations still notify`() {
        val gate = GenerationReadyGate()
        gate.watch("owner", id)
        assertFalse(gate.shouldDefer("owner", other))
        assertFalse(gate.shouldDefer("different-owner", id))
        gate.watch(null, null)
        assertFalse(gate.shouldDefer("owner", id))
    }
    @Test fun `push before response waits for server id`() {
        val gate = GenerationReadyGate()
        gate.watch("owner", "local-submission-uuid")
        assertTrue(gate.shouldDefer("owner", id))
        gate.watch("owner", other)
        assertFalse(gate.shouldDefer("owner", id))
        assertTrue(gate.shouldDefer("owner", other))
    }
    @Test fun `other images and accounts cannot release focused alert`() {
        val gate = GenerationReadyGate()
        gate.watch("owner", id)
        gate.imageDisplayed("owner", other)
        gate.imageDisplayed("other-owner", id)
        assertTrue(gate.shouldDefer("owner", id))
    }
}
