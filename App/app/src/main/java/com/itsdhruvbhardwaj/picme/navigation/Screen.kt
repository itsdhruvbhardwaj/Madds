package com.itsdhruvbhardwaj.picme.navigation

sealed class Screen(val route: String) {
    data object Splash : Screen("splash")
    data object Onboarding : Screen("onboarding")
    data object Login : Screen("login")
    data object Signup : Screen("signup")
    data object Home : Screen("home")
    data object Search : Screen("search")
    data object Collections : Screen("collections")
    data object Favorites : Screen("favorites")
    data object Create : Screen("create")
    data object History : Screen("history")
    data object Profile : Screen("profile")
    data object Purchases : Screen("purchases")
    data object CreditHistory : Screen("credit_history")
    data object StylePreferenceSetup : Screen("style_preference_setup")
    data object EditAvatar : Screen("edit_avatar")
    data object Settings : Screen("settings")
    data object Feedback : Screen("feedback")
    data object NotificationSettings : Screen("notification_settings")
    data object NotificationCollection : Screen("notification_collection/{collectionId}") {
        fun createRoute(id: String) = "notification_collection/$id"
    }
    data object CreatePassword : Screen("create_password")
    data object DeleteAccount : Screen("delete_account")
    data object VerifyGooglePasswordSetup : Screen("verify_google_password_setup?token={token}") {
        fun createRoute(token: String? = null) = if (token != null) "verify_google_password_setup?token=$token" else "verify_google_password_setup"
    }
    data object StyleDetails : Screen("style_details/{styleId}") {
        fun createRoute(styleId: String) = "style_details/$styleId"
    }
    data object SelectPhotos : Screen("select_photos/{styleId}") {
        fun createRoute(styleId: String) = "select_photos/$styleId"
    }
    data object Generation : Screen("generation/{styleId}?prompt={prompt}") {
        fun createRoute(styleId: String, prompt: String? = null): String {
            return if (prompt != null) {
                "generation/$styleId?prompt=${java.net.URLEncoder.encode(prompt, "UTF-8")}"
            } else {
                "generation/$styleId"
            }
        }
    }
    data object Result : Screen("result")
    
    data object StylesGrid : Screen("styles_grid?collection={collection}") {
        fun createRoute(collection: String? = null): String =
            if (collection != null) "styles_grid?collection=${android.net.Uri.encode(collection)}" else "styles_grid"
    }

    data object VerifyEmail : Screen("verify_email?email={email}&token={token}") {
        fun createRoute(email: String? = null, token: String? = null): String {
            val emailPart = if (email != null) "email=$email" else ""
            val tokenPart = if (token != null) "token=$token" else ""
            val query = listOf(emailPart, tokenPart).filter { it.isNotEmpty() }.joinToString("&")
            return if (query.isNotEmpty()) "verify_email?$query" else "verify_email"
        }
    }

    data object ForgotPassword : Screen("forgot_password?email={email}") {
        fun createRoute(email: String? = null) = if (email != null) "forgot_password?email=$email" else "forgot_password"
    }

    data object ResetPassword : Screen("reset_password?token={token}") {
        fun createRoute(token: String? = null) = if (token != null) "reset_password?token=$token" else "reset_password"
    }
}
