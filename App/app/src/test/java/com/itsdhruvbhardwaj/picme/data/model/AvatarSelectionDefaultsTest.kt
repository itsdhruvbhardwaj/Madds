package com.itsdhruvbhardwaj.picme.data.model

import org.junit.Assert.*
import org.junit.Test

class AvatarSelectionDefaultsTest {
    private val googleUser = User("user-a", "Tester", "test@example.com", true,
        profileImage = "https://example.com/google-photo.jpg", hasGoogleLogin = true, profileSetupComplete = false)

    @Test fun `first-time setup opens presets with the first avatar and background despite a Google photo`() {
        val draft = AvatarCatalog.initialSelection(googleUser)
        assertEquals("avatar", draft.mode)
        assertEquals(0, draft.tab)
        assertEquals(AvatarCatalog.defaultAvatar.id, draft.avatarId)
        assertEquals(AvatarCatalog.defaultBackground, draft.background)
    }

    @Test fun `editing a completed profile preserves its chosen photo`() {
        val draft = AvatarCatalog.initialSelection(googleUser.copy(profileSetupComplete = true))
        assertEquals("photo", draft.mode)
        assertEquals(1, draft.tab)
    }

    @Test fun `editing a saved preset preserves the selected character and background`() {
        val draft = AvatarCatalog.initialSelection(googleUser.copy(profileSetupComplete = true,
            profileAppearance = "avatar", avatarId = "avatar_002", avatarBackground = "sage"))
        assertEquals("avatar", draft.mode)
        assertEquals(0, draft.tab)
        assertEquals("avatar_002", draft.avatarId)
        assertEquals("sage", draft.background)
    }
}
