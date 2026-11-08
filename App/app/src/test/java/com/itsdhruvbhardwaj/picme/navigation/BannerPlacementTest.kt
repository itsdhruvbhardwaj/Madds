package com.itsdhruvbhardwaj.picme.navigation

import org.junit.Assert.*
import org.junit.Test

class BannerPlacementTest {
    @Test fun `account onboarding routes and initial avatar setup stay banner free`() {
        for (route in listOf(Screen.Splash.route, Screen.Onboarding.route, Screen.Login.route, Screen.Signup.route,
            Screen.StylePreferenceSetup.route, Screen.VerifyEmail.route, Screen.ForgotPassword.route, Screen.ResetPassword.route,
            Screen.VerifyGooglePasswordSetup.route, Screen.CreatePassword.route)) {
            assertFalse(bannerAllowed(route, false, false))
        }
        assertFalse(bannerAllowed(Screen.EditAvatar.route, false, true))
        assertFalse(bannerAllowed(null, false, false))
    }
    @Test fun `normal subscreens keep banners while main tabs remain banner free`() {
        assertTrue(bannerAllowed(Screen.EditAvatar.route, false, false))
        assertTrue(bannerAllowed(Screen.StyleDetails.route, false, false))
        assertTrue(bannerAllowed(Screen.Settings.route, false, false))
        assertFalse(bannerAllowed(Screen.Home.route, true, false))
    }
}
