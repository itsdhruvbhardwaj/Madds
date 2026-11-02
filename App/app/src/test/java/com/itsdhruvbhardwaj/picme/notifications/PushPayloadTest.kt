package com.itsdhruvbhardwaj.picme.notifications

import org.junit.Assert.*
import org.junit.Test
import okio.ByteString.Companion.encodeUtf8

internal const val USER_A = "aaaaaaaaaaaaaaaaaaaaaaaa"
internal const val USER_B = "bbbbbbbbbbbbbbbbbbbbbbbb"
internal const val SESSION_A = "111111111111111111111111"
internal const val SESSION_B = "222222222222222222222222"
internal fun access(user: String = USER_A, session: String = SESSION_A): String =
    "header." + "{\"sub\":\"$user\",\"sid\":\"$session\"}".encodeUtf8().base64Url() + ".signature"
internal fun message(version: Long = 1) = mapOf("title" to "New in Madds", "body" to "Find your next style", "type" to "PRODUCT_UPDATE",
    "category" to "productUpdates", "recipientUserId" to USER_A, "campaignId" to "cccccccccccccccccccccccc",
    "deliveryId" to "dddddddddddddddddddddddd", "bindingVersion" to version.toString(), "deepLink" to "picme://home")

class PushPayloadTest {
    @Test fun `valid message uses only validated internal destinations`() {
        assertNotNull(PushPayload.parse(message()))
        val styled = message() + mapOf("type" to "NEW_STYLE", "category" to "newStyles", "styleId" to "new-portrait", "deepLink" to "picme://styles/new-portrait")
        assertEquals("new-portrait", PushPayload.parse(styled)?.styleId)
        assertNull(PushPayload.parse(styled + ("deepLink" to "https://external.example")))
        assertNull(PushPayload.parse(styled + ("styleId" to "../other")))
        assertNull(PushPayload.parse(styled + ("collectionId" to "portrait")))
    }
    @Test fun `malformed and inconsistent message fields are dropped`() {
        for (change in listOf("category" to "offers", "type" to "UNKNOWN", "deliveryId" to "bad-id",
            "recipientUserId" to "email@example.com", "bindingVersion" to "-1", "bindingVersion" to "9223372036854775808",
            "title" to "", "body" to "x".repeat(501))) assertNull(PushPayload.parse(message() + change))
        assertNull(PushPayload.parse(message() + mapOf("type" to "NEW_STYLE", "category" to "newStyles")))
    }
    @Test fun `unsafe optional images never block valid text delivery`() {
        assertNull(PushPayload.parse(message() + ("imageUrl" to "javascript:alert(1)"))?.imageUrl)
        assertFalse(isSafePushImage("https://user:secret@example.com/image"))
        assertFalse(isSafePushImage("http://example.com/image"))
        assertTrue(isSafePushImage("https://res.cloudinary.com/demo/image/upload/photo.jpg"))
    }
    @Test fun `session identity reads the user and session claims without accepting malformed tokens`() {
        assertEquals(PushSession(USER_A, SESSION_A), PushSession.fromToken(access()))
        assertNull(PushSession.fromToken("invalid-token"))
        assertNotEquals(PushSession.fromToken(access()), PushSession.fromToken(access(session = SESSION_B)))
    }
    @Test fun `account switches and session changes reject queued messages`() {
        val payload = PushPayload.parse(message())!!
        val session = PushSession(USER_A, SESSION_A)
        fun allowed(current: PushSession?, cached: String?, bound: PushSession?) = canReceivePush(payload, current, cached, bound, 1, 5, true, true, false)
        assertTrue(allowed(session, USER_A, session))
        assertFalse(allowed(PushSession(USER_B, SESSION_B), USER_B, session))
        assertFalse(allowed(PushSession(USER_A, SESSION_B), USER_A, session))
        assertFalse(allowed(null, USER_A, session))
        assertFalse(allowed(session, USER_B, session))
    }
    @Test fun `logout opt out duplicate and stale binding all suppress display`() {
        val payload = PushPayload.parse(message())!!; val session = PushSession(USER_A, SESSION_A)
        assertFalse(canReceivePush(payload, session, USER_A, session, 1, 5, true, false, false))
        assertFalse(canReceivePush(payload, session, USER_A, session, 1, 5, false, true, false))
        assertFalse(canReceivePush(payload, session, USER_A, session, 1, 5, true, true, true))
        assertFalse(canReceivePush(payload, session, USER_A, session, 2, 5, true, true, false))
        assertFalse(canReceivePush(payload.copy(bindingVersion = 6), session, USER_A, session, 1, 5, true, true, false))
    }
}
