package com.itsdhruvbhardwaj.picme.data.model

import org.junit.Assert.*
import org.junit.Test

class StylePreviewTest {
    @Test fun `cover only style does not use legacy previews as a comparison`() {
        val style = Style(id = "cover-only", thumbnail = "own-cover.jpg", previewImages = listOf("other-before.jpg", "other-after.jpg"))
        assertNull(style.comparisonPreview())
        assertEquals("own-cover.jpg", style.thumbnail)
    }
    @Test fun `partial or blank pair falls back to cover even with legacy previews`() {
        val style = Style(thumbnail = "cover.jpg", previewImages = listOf("old-before.jpg", "old-after.jpg"))
        assertNull(style.copy(exampleBeforeUrl = "before.jpg").comparisonPreview())
        assertNull(style.copy(exampleAfterUrl = "after.jpg").comparisonPreview())
        assertNull(style.copy(exampleBeforeUrl = " ", exampleAfterUrl = "after.jpg").comparisonPreview())
    }
    @Test fun `complete explicit pair keeps before after preview`() {
        val style = Style(exampleBeforeUrl = " before.jpg ", exampleAfterUrl = "after.jpg", previewImages = listOf("old.jpg"))
        assertEquals("before.jpg" to "after.jpg", style.comparisonPreview())
    }
}
