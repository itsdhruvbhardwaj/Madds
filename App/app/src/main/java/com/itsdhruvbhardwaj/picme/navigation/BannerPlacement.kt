package com.itsdhruvbhardwaj.picme.navigation

private val adFreeAccountRoutes = setOf(
    Screen.StylePreferenceSetup.route, Screen.Splash.route, Screen.Onboarding.route, Screen.Login.route, Screen.Signup.route,
    Screen.VerifyEmail.route, Screen.ForgotPassword.route, Screen.ResetPassword.route,
    Screen.CreatePassword.route, Screen.VerifyGooglePasswordSetup.route
)

fun bannerAllowed(route: String?, isMainTab: Boolean, initialProfileSetup: Boolean): Boolean =
    route != null && !isMainTab && route !in adFreeAccountRoutes &&
        !(route == Screen.EditAvatar.route && initialProfileSetup)
