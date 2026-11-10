package com.itsdhruvbhardwaj.picme.ui.components

import org.junit.Assert.*
import org.junit.Test

class NativeFeedPlacementTest {
    @Test fun `Home spacing keeps first collections ad free and caps ads`() {
        assertNull(nativeFeedSlotIndex(0,12,3,2))
        assertNull(nativeFeedSlotIndex(1,12,3,2))
        assertEquals(0,nativeFeedSlotIndex(2,12,3,2))
        assertEquals(1,nativeFeedSlotIndex(5,12,3,2))
        assertNull(nativeFeedSlotIndex(8,12,3,2))
    }
    @Test fun `Explore inserts after twelve styles and preserves feed ordering`() {
        // Mosaic groups have six styles each; insertion does not consume style items.
        assertEquals(0,nativeFeedSlotIndex(1,7,12/6,3))
        assertEquals(1,nativeFeedSlotIndex(3,7,12/6,3))
        assertEquals(2,nativeFeedSlotIndex(5,7,12/6,3))
        assertNull(nativeFeedSlotIndex(7,9,12/6,3))
    }
    @Test fun `no trailing ad at end of catalogue but pagination may continue`() {
        assertNull(nativeFeedSlotIndex(2,3,3,2))
        assertEquals(0,nativeFeedSlotIndex(2,3,3,2,hasMore=true))
        assertNull(nativeFeedSlotIndex(-1,3,3,2))
        assertNull(nativeFeedSlotIndex(3,3,3,2,hasMore=true))
    }
}
