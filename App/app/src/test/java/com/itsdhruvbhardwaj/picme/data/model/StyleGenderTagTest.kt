package com.itsdhruvbhardwaj.picme.data.model

import com.google.gson.Gson
import org.junit.Assert.*
import org.junit.Test

class StyleGenderTagTest {
    @Test fun `explicit tags show labels while old or neutral styles show nothing`() {
        val gson = Gson()
        assertEquals("For her", genderTagLabel(gson.fromJson("{\"genderTag\":\"her\"}", Style::class.java).genderTag))
        assertEquals("For him", genderTagLabel(gson.fromJson("{\"genderTag\":\"him\"}", Style::class.java).genderTag))
        for (json in listOf("{}", "{\"genderTag\":\"none\"}", "{\"genderTag\":null}", "{\"genderTag\":\"unknown\"}")) {
            assertNull(genderTagLabel(gson.fromJson(json, Style::class.java).genderTag))
        }
    }
}
