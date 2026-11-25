package com.itsdhruvbhardwaj.picme.data.model

import com.google.gson.Gson
import org.junit.Assert.*
import org.junit.Test

class StyleGroupTest {
    @Test fun singleCollectionMemberKeepsGroupTitleWithoutInventingVariants() {
        val style = Gson().fromJson("""{"id":"beach-view","name":"Beach View","groupName":"Beach Styles"}""", Style::class.java)
        assertEquals("Beach Styles", style.cardTitle)
        assertEquals("Beach View", style.name)
        assertEquals(0, style.variantCount)
        assertEquals("Beach Styles", style.publicCacheCopy().cardTitle)
    }

    @Test fun prefetchUsesOnlyImmediateNeighboursAndUnchangedComparisonUrls() {
        val styles = (0..4).map { Style(id = "$it", thumbnail = "thumb-$it", exampleBeforeUrl = "before-$it", exampleAfterUrl = "after-$it") }
        val group = StyleVariantGroup("group", "Looks", "0", styles)
        assertEquals(listOf("after-3", "before-3", "after-1", "before-1"), styles[2].copy(group = group).adjacentPreviewUrls())
        assertEquals(listOf("after-1", "before-1"), styles[0].copy(group = group).adjacentPreviewUrls())
        assertEquals(emptyList<String>(), styles[2].adjacentPreviewUrls())
        assertEquals(listOf("thumb-1"), styles[0].copy(group = group.copy(variants = listOf(styles[0], styles[1].copy(exampleBeforeUrl = null)))).adjacentPreviewUrls())
    }
    @Test fun groupedCardsKeepRealIdsAndVariantGenerationRequirements() {
        val first = Style(id = "lavender", name = "Lavender", tokensRequired = 10, imageCount = 1)
        val second = Style(id = "pink", name = "Pink", tokensRequired = 15, imageCount = 2)
        val group = StyleVariantGroup("family", "Pastel Saree", first.id, listOf(second, first))
        val card = first.copy(group = group)
        val entries = styleCacheEntries(listOf(card))
        assertEquals("Pastel Saree", card.cardTitle)
        assertEquals("lavender", card.id)
        assertEquals(15, entries["pink"]?.tokensRequired)
        assertEquals(2, entries["pink"]?.imageCount)
        assertEquals(listOf("pink", "lavender"), entries["pink"]?.group?.variants?.map { it.id })
    }
    @Test fun diskSnapshotsRemoveFavoriteStateAndPromptsFromEveryVariant() {
        val member = Style(id = "pink", isFavorite = true, prompt = "private prompt")
        val card = Style(id = "lavender", isFavorite = true, prompt = "private prompt", group = StyleVariantGroup("family", "Saree", "lavender", listOf(member)))
        val clean = card.publicCacheCopy()
        assertFalse(clean.isFavorite); assertEquals("", clean.prompt)
        assertFalse(clean.group!!.variants!![0].isFavorite); assertEquals("", clean.group.variants!![0].prompt)
        assertNull(clean.group.variants!![0].group)
    }
    @Test fun oldPayloadsAndCachesStillDecodeWithoutGroupMetadata() {
        val old = Gson().fromJson("""{"id":"old","name":"Old style"}""", Style::class.java)
        assertNull(old.group); assertEquals("Old style", old.cardTitle); assertEquals(0, old.variantCount)
    }
}
