package com.itsdhruvbhardwaj.picme.notifications

import android.content.Intent
import android.net.Uri
import com.itsdhruvbhardwaj.picme.navigation.opensGenerationGallery
import org.junit.Assert.*
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

class GenerationNotificationTapTest {
    private val owner = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val photo = "bbbbbbbbbbbbbbbbbbbbbbbb"

    private fun intent(): Intent {
        val uri: Uri = mock()
        whenever(uri.scheme).thenReturn("madds-generation")
        whenever(uri.host).thenReturn("open")
        whenever(uri.pathSegments).thenReturn(listOf(owner, photo))
        val intent: Intent = mock()
        whenever(intent.action).thenReturn(GenerationNotifications.OPEN_ACTION)
        whenever(intent.data).thenReturn(uri)
        return intent
    }
    @Test fun `ready notification routes to the gallery independently of cached generation status`() {
        val intent = intent()
        whenever(intent.getStringExtra("generation_stage")).thenReturn("completed")
        assertEquals("$owner:$photo", GenerationNotifications.tap(intent))
        assertEquals("completed", GenerationNotifications.tapStage(intent))
        assertTrue(opensGenerationGallery(GenerationNotifications.tapStage(intent)))
    }
    @Test fun `legacy ready notifications remain usable without a stage extra`() {
        val intent = intent()
        assertEquals("$owner:$photo", GenerationNotifications.tap(intent))
        assertNull(GenerationNotifications.tapStage(intent))
        assertTrue(opensGenerationGallery(GenerationNotifications.tapStage(intent)))
        assertEquals("$owner:$photo:legacy", GenerationNotifications.tapEvent(intent))
    }
    @Test fun `new notifications for the same photo have distinct consumable events`() {
        val intent = intent()
        whenever(intent.getStringExtra("generation_open_event")).thenReturn("first-event")
        val first = GenerationNotifications.tapEvent(intent)
        whenever(intent.getStringExtra("generation_open_event")).thenReturn("second-event")
        assertNotEquals(first, GenerationNotifications.tapEvent(intent))
        assertEquals("$owner:$photo", GenerationNotifications.tap(intent))
    }
    @Test fun `progress and failure notifications keep their status destinations`() {
        val intent = intent()
        for (stage in listOf("processing", "failed", "outcome_unknown")) {
            whenever(intent.getStringExtra("generation_stage")).thenReturn(stage)
            assertEquals(stage, GenerationNotifications.tapStage(intent))
            assertFalse(opensGenerationGallery(GenerationNotifications.tapStage(intent)))
        }
    }
    @Test fun `unrelated intents cannot supply a generation stage or event`() {
        val intent = intent()
        whenever(intent.action).thenReturn(Intent.ACTION_MAIN)
        whenever(intent.getStringExtra("generation_stage")).thenReturn("completed")
        assertNull(GenerationNotifications.tap(intent))
        assertNull(GenerationNotifications.tapStage(intent))
        assertNull(GenerationNotifications.tapEvent(intent))
    }
    @Test fun `a cached progress update cannot overwrite a ready notification pending intent`() {
        val stages = listOf("completed", "processing", "failed", "outcome_unknown")
        assertEquals(4, stages.map(::generationNotificationRequestCode).toSet().size)
        assertNotEquals(generationNotificationRequestCode("completed"), generationNotificationRequestCode("processing"))
    }
}
