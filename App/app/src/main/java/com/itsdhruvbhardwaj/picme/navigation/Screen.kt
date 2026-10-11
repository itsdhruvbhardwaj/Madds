package com.itsdhruvbhardwaj.picme.navigation

sealed class Screen(val route: String) {
    data object Splash : Screen("splash")
    data object Onboarding : Screen("onboarding")
    data object Login : Screen("login")
    data object Signup : Screen("signup")
    data object Home : Screen("home")
    data object Explore : Screen("explore")
    data object Create : Screen("create")
    data object History : Screen("history")
    data object Profile : Screen("profile")
    data object StyleDetails : Screen("style_details/{styleId}") {
        fun createRoute(styleId: String) = "style_details/$styleId"
    }
    data object SelectPhotos : Screen("select_photos/{styleId}") {
        fun createRoute(styleId: String) = "select_photos/$styleId"
    }
    data object Generation : Screen("generation/{styleId}") {
        fun createRoute(styleId: String) = "generation/$styleId"
    }
    data object Result : Screen("result")
    
    data object StylesGrid : Screen("styles_grid?category={category}&collection={collection}") {
        fun createRoute(category: String? = null, collection: String? = null): String {
            val categoryPart = if (category != null) "category=$category" else ""
            val collectionPart = if (collection != null) "collection=$collection" else ""
            val query = listOf(categoryPart, collectionPart).filter { it.isNotEmpty() }.joinToString("&")
            return if (query.isNotEmpty()) "styles_grid?$query" else "styles_grid"
        }
    }

    data object VerifyEmail : Screen("verify_email?email={email}&token={token}") {
        fun createRoute(email: String? = null, token: String? = null): String {
            val emailPart = if (email != null) "email=$email" else ""
            val tokenPart = if (token != null) "token=$token" else ""
            val query = listOf(emailPart, tokenPart).filter { it.isNotEmpty() }.joinToString("&")
            return if (query.isNotEmpty()) "verify_email?$query" else "verify_email"
        }
    }
}
