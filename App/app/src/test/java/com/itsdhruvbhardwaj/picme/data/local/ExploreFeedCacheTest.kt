package com.itsdhruvbhardwaj.picme.data.local

import com.itsdhruvbhardwaj.picme.data.model.Style
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ExploreFeedCacheTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test fun `snapshot survives recreation with stable versioned URLs and no account fields`() {
        val directory = temporary.newFolder()
        val style = Style(id = "one", thumbnail = "https://res.cloudinary.com/cloud/image/upload/v1/one.webp",
            prompt = "not needed offline", isFavorite = true)
        ExploreFeedCache(directory).write("female", null, "", listOf(style))
        val restored = ExploreFeedCache(directory).read("female", null, "")!!.single()
        assertEquals(style.thumbnail, restored.thumbnail)
        assertFalse(restored.isFavorite)
        assertEquals("", restored.prompt)
        assertNull(ExploreFeedCache(directory).read("male", null, ""))
        assertNull(ExploreFeedCache(directory).read("female", "Trending", ""))
        assertNull(ExploreFeedCache(directory).read("female", null, "saree"))
    }

    @Test fun `new shuffled snapshot replaces old order and changed asset version`() {
        val cache = ExploreFeedCache(temporary.newFolder())
        cache.write("all", null, "", listOf(Style(id = "one", thumbnail = "https://cdn/v1/one"), Style(id = "two")))
        cache.write("all", null, "", listOf(Style(id = "two"), Style(id = "one", thumbnail = "https://cdn/v2/one")))
        val restored = cache.read("all", null, "")!!
        assertEquals(listOf("two", "one"), restored.map { it.id })
        assertEquals("https://cdn/v2/one", restored.last().thumbnail)
    }

    @Test fun `expired and corrupt snapshots do not break discovery`() {
        val directory = temporary.newFolder()
        var time = 1000L
        val cache = ExploreFeedCache(directory) { time }
        cache.write("all", null, "", listOf(Style(id = "one")))
        time += 8L * 24 * 60 * 60 * 1000
        assertNull(cache.read("all", null, ""))
        cache.write("all", null, "", listOf(Style(id = "one")))
        directory.listFiles()!!.single().writeText("broken json")
        assertNull(cache.read("all", null, ""))
    }

    @Test fun `cached searches are bounded and successful empty response clears stale results`() {
        val directory = temporary.newFolder()
        val cache = ExploreFeedCache(directory)
        repeat(20) { cache.write("all", null, "query-$it", listOf(Style(id = "$it"))) }
        assertTrue(directory.listFiles()!!.size <= 8)
        cache.write("all", null, "", emptyList())
        assertEquals(emptyList<Style>(), cache.read("all", null, ""))
    }
}
