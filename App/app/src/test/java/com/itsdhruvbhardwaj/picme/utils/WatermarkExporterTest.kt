package com.itsdhruvbhardwaj.picme.utils

import com.google.gson.Gson
import org.junit.Assert.*
import org.junit.Test

class WatermarkExporterTest {
    @Test fun `PNG aspect ratio and bottom right padding are preserved on every image shape`() {
        for ((width,height) in listOf(1024 to 1536, 1536 to 1024, 1024 to 1024, 400 to 2400)) {
            val bounds = watermarkBounds(width,height,2172,724,18,2)
            assertEquals(width * .18f,bounds.right - bounds.left,.01f)
            assertEquals(3f,(bounds.right - bounds.left) / (bounds.bottom - bounds.top),.01f)
            val margin = minOf(width,height) * .02f
            assertEquals(margin,width - bounds.right,.01f)
            assertEquals(margin,height - bounds.bottom,.01f)
            assertTrue(bounds.left >= 0 && bounds.top >= 0)
        }
    }
    @Test fun `tall replacement logos fit within the image`() {
        val bounds = watermarkBounds(1000,100,10,1000,35,10)
        assertTrue(bounds.top >= 9.9f && bounds.bottom <= 90f)
        assertTrue(bounds.left >= 0)
    }
    @Test fun `settings accept disabled without a logo and reject invalid enabled configurations`() {
        val base = WatermarkConfig(false,"",18,85,2,0)
        assertTrue(base.valid())
        assertFalse(base.copy(enabled=true).valid())
        assertFalse(base.copy(widthPercent=36).valid())
        assertFalse(base.copy(opacityPercent=0).valid())
        assertFalse(base.copy(paddingPercent=-1).valid())
        assertFalse(base.copy(revision=-1).valid())
        assertFalse(WatermarkConfig().valid())
    }
    @Test fun `versioned PNG contract survives JSON and excludes arbitrary remote images`() {
        val url = "https://res.cloudinary.com/test/image/upload/v123/picmee/branding/watermarks/logo-b8b1822c-1dfe-4be9-bdc5-9ad7d035b20f.png"
        val config = WatermarkConfig(true,url,18,85,2,4)
        assertTrue(config.valid())
        assertEquals(config,Gson().fromJson(Gson().toJson(config),WatermarkConfig::class.java))
        assertFalse(config.copy(logoUrl=url.replace("https:","http:")).valid())
        assertFalse(config.copy(logoUrl=url.replace("res.cloudinary.com","example.com")).valid())
        assertFalse(config.copy(logoUrl=url.replace(".png",".svg")).valid())
    }
}
