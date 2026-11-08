package com.itsdhruvbhardwaj.picme.notifications

import com.google.gson.Gson
import org.junit.Assert.*
import org.junit.Test

class PushDeviceRequestTest {
    private val gson = Gson()

    @Test fun `registration uses the exact backend JSON contract`() {
        val request = PushDeviceRequest("e87ae1cb-90d4-4d81-b6f8-aa7ae28b15e4", 42, "test-fcm-token", true)
        val json = gson.toJsonTree(request).asJsonObject
        assertEquals(setOf("deviceId", "bindingVersion", "fcmToken", "permissionGranted", "appVersionCode", "appVersionName"), json.keySet())
        assertEquals(com.itsdhruvbhardwaj.picme.BuildConfig.VERSION_CODE, json["appVersionCode"].asInt)
        assertEquals(com.itsdhruvbhardwaj.picme.BuildConfig.VERSION_NAME, json["appVersionName"].asString)
        assertEquals(request.deviceId, json["deviceId"].asString)
        assertEquals(42L, json["bindingVersion"].asLong)
        assertEquals("test-fcm-token", json["fcmToken"].asString)
        assertTrue(json["permissionGranted"].asBoolean)
        assertEquals(request, gson.fromJson(json, PushDeviceRequest::class.java))
    }

    @Test fun `detachment preserves installation revision and does not invent a token`() {
        val json = gson.toJsonTree(PushDeviceRequest("installation", 43)).asJsonObject
        assertEquals(setOf("deviceId", "bindingVersion", "permissionGranted", "appVersionCode", "appVersionName"), json.keySet())
        assertEquals("installation", json["deviceId"].asString)
        assertEquals(43L, json["bindingVersion"].asLong)
        assertFalse(json["permissionGranted"].asBoolean)
    }
}
