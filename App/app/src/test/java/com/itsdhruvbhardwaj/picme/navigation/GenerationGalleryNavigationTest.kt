package com.itsdhruvbhardwaj.picme.navigation

import org.junit.Assert.*
import org.junit.Test

class GenerationGalleryNavigationTest {
    private val owner = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val photo = "bbbbbbbbbbbbbbbbbbbbbbbb"

    @Test fun `ready headers and notifications resolve to the gallery photo`() {
        assertEquals(photo, requestedGalleryPhoto("$owner:$photo", owner))
        assertTrue(opensGenerationGallery("completed"))
        assertTrue(opensGenerationGallery(null))
    }
    @Test fun `processing and failed reminders retain their existing status flow`() {
        for (status in listOf("processing", "submitting", "checking", "failed", "outcome_unknown")) {
            assertFalse(opensGenerationGallery(status))
        }
    }
    @Test fun `a notification cannot open a photo for a different signed in account`() {
        assertNull(requestedGalleryPhoto("$owner:$photo", "cccccccccccccccccccccccc"))
        assertNull(requestedGalleryPhoto("$owner:$photo", null))
    }
    @Test fun `consumed or malformed requests do not reopen a viewer`() {
        assertNull(requestedGalleryPhoto(null, owner))
        assertNull(requestedGalleryPhoto("$owner:invalid", owner))
        assertNull(requestedGalleryPhoto("$owner:$photo:extra", owner))
        assertNull(requestedGalleryPhoto(photo, owner))
    }
    @Test fun `activity recreation does not replay an already handled notification intent`() {
        val request = "$owner:$photo"
        assertNull(restoredGenerationRequest(true, null, request, "event-one", "event-one"))
        assertEquals(request, restoredGenerationRequest(true, request, null))
        assertEquals(request, restoredGenerationRequest(false, null, request))
    }
    @Test fun `a fresh notification wins over an older restored consumed request`() {
        val request = "$owner:$photo"
        assertEquals(request, restoredGenerationRequest(true, null, request, "new-event", "old-event"))
        assertEquals(request, restoredGenerationRequest(true, "$owner:cccccccccccccccccccccccc", request, "new-event", "old-event"))
    }
}
