package com.itsdhruvbhardwaj.picme.navigation
import com.google.gson.Gson
import com.itsdhruvbhardwaj.picme.data.model.User
import org.junit.Assert.*
import org.junit.Test
class AccountSetupTest {
    private val user = User("new", "Name", "name@example.com", true, profileSetupComplete = false, stylePreferenceSetupComplete = false)
    @Test fun `avatar is offered first then preference`() {
        assertEquals(Screen.EditAvatar, nextAccountSetup(user, null))
        assertEquals(Screen.StylePreferenceSetup, nextAccountSetup(user.copy(profileSetupComplete = true), user.id))
    }
    @Test fun `skipping an avatar can still proceed to preference when its network save fails`() {
        assertEquals(Screen.StylePreferenceSetup, nextAccountSetup(user, user.id))
    }
    @Test fun `completed and legacy accounts never get the new step`() {
        assertNull(nextAccountSetup(user.copy(profileSetupComplete = true, stylePreferenceSetupComplete = true), null))
        val legacy = Gson().fromJson("""{"id":"old","name":"Name","email":"old@example.com","emailVerified":true}""", User::class.java)
        assertNull(nextAccountSetup(legacy, null))
        assertNull(nextAccountSetup(null, null))
    }
    @Test fun `pending preference survives profile serialization and can resume after restart`() {
        val pending = user.copy(profileSetupComplete = true)
        val restored = Gson().fromJson(Gson().toJson(pending), User::class.java)
        assertEquals(Screen.StylePreferenceSetup, nextAccountSetup(restored, null))
    }
}
