package com.itsdhruvbhardwaj.picme.ui.screens.profile

import android.net.Uri
import com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration
import com.itsdhruvbhardwaj.picme.data.model.generationExpiry
import org.junit.Assert.*
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

class GenerationGalleryEntriesTest {
    private val now = generationExpiry("2030-01-01T00:00:00.000Z")!!
    private fun photo(id: String, expiry: String = "2030-01-02T00:00:00.000Z") =
        RecoverableGeneration(id, styleName = "Portrait $id", status = "completed", resultAvailable = true, resultExpiresAt = expiry)
    private fun uri(id: String): Uri = mock<Uri>().also { whenever(it.lastPathSegment).thenReturn(id) }

    @Test fun `unsaved contains active photos and processing requests but excludes saved photos`() {
        val entries = generationGalleryEntries(listOf(photo("one"), photo("two"), RecoverableGeneration("pending")),
            mapOf("two" to uri("2")), emptyList(), now, GenerationGalleryTab.Unsaved)
        assertEquals(listOf("one", "pending"), entries.map { it.generationId })
        assertTrue(entries.all { it.savedUri == null })
    }
    @Test fun `expired failed and unavailable results cannot appear as unsaved photos`() {
        val entries = generationGalleryEntries(listOf(photo("expired", "2029-12-31T00:00:00.000Z"),
            photo("boundary", "2030-01-01T00:00:00.000Z"), photo("failed").copy(status = "failed"),
            photo("missing").copy(resultAvailable = false)), emptyMap(), emptyList(), now, GenerationGalleryTab.Unsaved)
        assertTrue(entries.isEmpty())
    }
    @Test fun `saving moves a photo into saved without duplicating it`() {
        val photo = photo("one")
        val device = uri("42")
        assertEquals(1, generationGalleryEntries(listOf(photo), emptyMap(), emptyList(), now, GenerationGalleryTab.Unsaved).size)
        val saved = mapOf("one" to device)
        assertTrue(generationGalleryEntries(listOf(photo), saved, listOf(device), now, GenerationGalleryTab.Unsaved).isEmpty())
        val entries = generationGalleryEntries(listOf(photo), saved, listOf(device), now, GenerationGalleryTab.Saved)
        assertEquals(1, entries.size)
        assertEquals(device, entries.single().savedUri)
        assertEquals(photo, entries.single().operation)
    }
    @Test fun `a saved device copy survives server expiry`() {
        val device = uri("42")
        val entries = generationGalleryEntries(listOf(photo("one", "2029-12-31T00:00:00.000Z")),
            mapOf("one" to device), listOf(device), now, GenerationGalleryTab.Saved)
        assertEquals(device, entries.single().savedUri)
    }
    @Test fun `media store URI aliases merge into one saved photo with its metadata`() {
        val mapped = uri("42")
        val alias = uri("42")
        val older = uri("43")
        val entries = generationGalleryEntries(listOf(photo("one")), mapOf("one" to mapped),
            listOf(alias, older), now, GenerationGalleryTab.Saved)
        assertEquals(2, entries.size)
        assertEquals("one", entries.first().generationId)
        assertEquals("Portrait one", entries.first().operation?.styleName)
        assertEquals(older, entries.last().savedUri)
    }
    @Test fun `saved supports older local photos and saved notifications without remote metadata`() {
        val mapped = uri("42")
        val older = uri("43")
        val entries = generationGalleryEntries(emptyList(), mapOf("one" to mapped), listOf(older), now, GenerationGalleryTab.Saved)
        assertEquals(listOf(mapped, older), entries.map { it.savedUri })
        assertEquals("one", entries.first().generationId)
        assertNull(entries.last().generationId)
        assertTrue(generationGalleryEntries(emptyList(), emptyMap(), listOf(older), now, GenerationGalleryTab.Unsaved).isEmpty())
    }
}
