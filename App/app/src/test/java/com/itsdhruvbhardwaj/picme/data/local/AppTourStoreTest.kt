package com.itsdhruvbhardwaj.picme.data.local

import android.content.SharedPreferences
import org.junit.Assert.*
import org.junit.Test
import org.mockito.kotlin.*

class AppTourStoreTest {
    @Test fun `completion is durable account scoped and queued until server acknowledgement`() {
        val prefs=mock<SharedPreferences>();val editor=mock<SharedPreferences.Editor>()
        val ints=mutableMapOf<String,Int>();val strings=mutableMapOf<String,String>()
        whenever(prefs.edit()).thenReturn(editor)
        whenever(prefs.getInt(any(),any())).thenAnswer{ints[it.getArgument<String>(0)]?:it.getArgument<Int>(1)}
        whenever(prefs.getString(any(),anyOrNull())).thenAnswer{strings[it.getArgument<String>(0)]}
        whenever(editor.putInt(any(),any())).thenAnswer{ints[it.getArgument(0)]=it.getArgument(1);editor}
        whenever(editor.putString(any(),anyOrNull())).thenAnswer{strings[it.getArgument(0)]=it.getArgument(1);editor}
        whenever(editor.remove(any())).thenAnswer{strings.remove(it.getArgument<String>(0));editor}
        whenever(editor.commit()).thenReturn(true)
        val store=AppTourStore(prefs)
        assertFalse(store.seen("a"));assertTrue(store.finish("a","SKIP"))
        assertTrue(AppTourStore(prefs).seen("a"));assertFalse(store.seen("b"))
        assertEquals("SKIP",store.pending("a"));store.acknowledged("a","COMPLETE")
        assertEquals("SKIP",store.pending("a"));store.acknowledged("a","SKIP")
        assertNull(store.pending("a"));assertTrue(store.seen("a"));verify(editor).commit()
    }
}
