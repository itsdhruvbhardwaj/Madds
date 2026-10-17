package com.itsdhruvbhardwaj.picme.navigation

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.edit
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.navArgument
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.BannerAdView
import com.itsdhruvbhardwaj.picme.ui.components.PicMeBottomNavigationBar
import com.itsdhruvbhardwaj.picme.ui.screens.auth.LoginScreen
import com.itsdhruvbhardwaj.picme.ui.screens.auth.SignupScreen
import com.itsdhruvbhardwaj.picme.ui.screens.auth.VerifyEmailScreen
import com.itsdhruvbhardwaj.picme.ui.screens.create.GenerationScreen
import com.itsdhruvbhardwaj.picme.ui.screens.create.GenerationUiState
import com.itsdhruvbhardwaj.picme.ui.screens.create.GenerationViewModel
import com.itsdhruvbhardwaj.picme.ui.screens.create.ResultScreen
import com.itsdhruvbhardwaj.picme.ui.screens.create.SelectPhotosScreen
import com.itsdhruvbhardwaj.picme.ui.screens.home.HomeScreen
import com.itsdhruvbhardwaj.picme.ui.screens.home.HomeViewModel
import com.itsdhruvbhardwaj.picme.ui.screens.home.StyleDetailsScreen
import com.itsdhruvbhardwaj.picme.ui.screens.home.StyleDetailsViewModel
import com.itsdhruvbhardwaj.picme.ui.screens.home.StylesGridScreen
import com.itsdhruvbhardwaj.picme.ui.screens.home.StylesGridViewModel
import com.itsdhruvbhardwaj.picme.ui.screens.onboarding.OnboardingScreen
import com.itsdhruvbhardwaj.picme.ui.screens.profile.ProfileScreen
import com.itsdhruvbhardwaj.picme.ui.screens.splash.SplashScreen

@Composable
fun NavGraph(
    navController: NavHostController,
    authViewModel: AuthViewModel,
    homeViewModel: HomeViewModel,
    generationViewModel: GenerationViewModel,
    styleRepository: StyleRepository
) {
    val context = LocalContext.current
    val prefs = context.getSharedPreferences("picme_prefs", Context.MODE_PRIVATE)
    
    val authState by authViewModel.authState.collectAsState()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    // Synchronize credits balance with generation lifecycle using silent refresh
    LaunchedEffect(Unit) {
        generationViewModel.onProfileRefreshRequested = {
            authViewModel.checkSession(isInitial = true)
        }
    }

    val bottomBarScreens = listOf(
        Screen.Home.route,
        Screen.Explore.route,
        Screen.Create.route,
        Screen.History.route,
        Screen.Profile.route
    )
    
    val isBottomBarVisible = currentRoute in bottomBarScreens

    // Global Layout: Banner pushes content up physically.
    Column(
        modifier = Modifier
            .fillMaxSize()
            .navigationBarsPadding()
    ) {
        // Content Area: Occupies all available space above the banner.
        Box(modifier = Modifier.weight(1f)) {
            NavHost(
                navController = navController,
                startDestination = Screen.Splash.route,
                modifier = Modifier.fillMaxSize()
            ) {
                composable(Screen.Splash.route) {
                    SplashScreen(onSplashFinished = {
                        if (canNavigateFromSplash(authState)) {
                            navigateFromSplash(navController, authState, prefs)
                        }
                    })
                }

                composable(Screen.Onboarding.route) {
                    OnboardingScreen(
                        onFinish = {
                            prefs.edit { putBoolean("onboarding_completed", true) }
                            navController.navigate(Screen.Login.route) {
                                popUpTo(Screen.Onboarding.route) { inclusive = true }
                            }
                        },
                        onSkip = {
                            prefs.edit { putBoolean("onboarding_completed", true) }
                            navController.navigate(Screen.Login.route) {
                                popUpTo(Screen.Onboarding.route) { inclusive = true }
                            }
                        }
                    )
                }

                composable(Screen.Login.route) {
                    LoginScreen(
                        authState = authState,
                        onLoginClick = { e, p -> authViewModel.login(e, p) },
                        onResendVerificationClick = { e -> authViewModel.resendVerification(e) },
                        onSignUpClick = { navController.navigate(Screen.Signup.route) }
                    )
                    LaunchedEffect(authState) {
                        if (authState is AuthState.Authenticated) {
                            navController.navigate(Screen.Home.route) { 
                                popUpTo(Screen.Login.route) { inclusive = true } 
                            }
                        }
                    }
                }

                composable(Screen.Signup.route) {
                    SignupScreen(
                        authState = authState,
                        onSignupClick = { n, e, p -> authViewModel.signup(n, e, p) },
                        onSignInClick = { navController.navigate(Screen.Login.route) },
                        onBackClick = { navController.popBackStack() }
                    )
                }

                composable(Screen.Home.route) {
                    HomeScreen(
                        authViewModel = authViewModel,
                        viewModel = homeViewModel,
                        onStyleClick = { id -> navController.navigate(Screen.StyleDetails.createRoute(id)) },
                        onSeeAllClick = { c, col -> navController.navigate(Screen.StylesGrid.createRoute(c, col)) },
                        onProfileClick = { navController.navigate(Screen.Profile.route) }
                    )
                }

                composable(Screen.Profile.route) {
                    ProfileScreen(
                        authViewModel = authViewModel,
                        onLogoutClick = { authViewModel.logout() },
                        onSettingsClick = {},
                        onNavigateToMyGenerations = { navController.navigate(Screen.History.route) }
                    )
                }

                composable(
                    route = Screen.StyleDetails.route,
                    arguments = listOf(navArgument("styleId") { type = NavType.StringType })
                ) { backStackEntry ->
                    val styleId = backStackEntry.arguments?.getString("styleId") ?: ""
                    StyleDetailsScreen(
                        authViewModel = authViewModel,
                        viewModel = viewModel(factory = StyleDetailsViewModel.provideFactory(styleRepository, styleId)),
                        onBackClick = { navController.popBackStack() },
                        onTryStyleClick = { id -> navController.navigate(Screen.SelectPhotos.createRoute(id)) }
                    )
                }

                composable(
                    route = Screen.SelectPhotos.route,
                    arguments = listOf(navArgument("styleId") { type = NavType.StringType })
                ) { backStackEntry ->
                    val styleId = backStackEntry.arguments?.getString("styleId") ?: ""
                    SelectPhotosScreen(
                        styleId = styleId,
                        styleRepository = styleRepository,
                        onBackClick = { navController.popBackStack() },
                        onContinueClick = { uris -> 
                            generationViewModel.setSelectedPhotos(uris)
                            navController.navigate(Screen.Generation.createRoute(styleId)) 
                        }
                    )
                }

                composable(
                    route = Screen.Generation.route,
                    arguments = listOf(navArgument("styleId") { type = NavType.StringType })
                ) { backStackEntry ->
                    val styleId = backStackEntry.arguments?.getString("styleId") ?: ""
                    val genState by generationViewModel.uiState.collectAsState()
                    val statusMsg by generationViewModel.statusMessage.collectAsState()
                    val selectedPhotos by generationViewModel.selectedPhotos.collectAsState()
                    val isAdVisible by generationViewModel.isInterstitialVisible.collectAsState()

                    LaunchedEffect(Unit) { generationViewModel.generateImage(styleId) }

                    GenerationScreen(
                        state = genState,
                        statusMessage = statusMsg,
                        selectedPhotos = selectedPhotos,
                        isInterstitialVisible = isAdVisible,
                        onAdShow = { generationViewModel.setInterstitialVisible(true) },
                        onAdDismiss = { generationViewModel.setInterstitialVisible(false) },
                        onCancelClick = { 
                            generationViewModel.resetState()
                            navController.popBackStack() 
                        },
                        onRetryClick = { generationViewModel.generateImage(styleId) },
                        onSuccess = { _ ->
                            navController.navigate(Screen.Result.route) { 
                                popUpTo(Screen.Generation.route) { inclusive = true } 
                            }
                        }
                    )
                }
                
                composable(Screen.Result.route) {
                    val genState by generationViewModel.uiState.collectAsState()
                    val isActionLoading by generationViewModel.isActionLoading.collectAsState()
                    val imageBase64 = (genState as? GenerationUiState.Success)?.imageBase64 ?: ""

                    ResultScreen(
                        imageBase64 = imageBase64,
                        isActionLoading = isActionLoading,
                        viewModel = generationViewModel,
                        onBackClick = { 
                            generationViewModel.resetState()
                            navController.navigate(Screen.Home.route) { popUpTo(Screen.Home.route) { inclusive = true } } 
                        },
                        onSaveClick = { generationViewModel.saveImageToGallery(context) },
                        onShareClick = { generationViewModel.shareImage(context) },
                        onGenerateAgainClick = {
                            generationViewModel.resetState()
                            navController.popBackStack()
                        }
                    )
                }

                composable(
                    route = Screen.VerifyEmail.route,
                    arguments = listOf(
                        navArgument("email") { type = NavType.StringType; nullable = true },
                        navArgument("token") { type = NavType.StringType; nullable = true }
                    )
                ) { backStackEntry ->
                    val email = backStackEntry.arguments?.getString("email")
                    val token = backStackEntry.arguments?.getString("token")
                    VerifyEmailScreen(
                        email = email,
                        token = token,
                        authState = authState,
                        onVerifyClick = { authViewModel.verifyEmail(it) },
                        onResendClick = { email?.let { authViewModel.resendVerification(it) } },
                        onBackClick = { navController.popBackStack() }
                    )
                }

                composable(
                    route = Screen.StylesGrid.route,
                    arguments = listOf(
                        navArgument("category") { type = NavType.StringType; nullable = true },
                        navArgument("collection") { type = NavType.StringType; nullable = true }
                    )
                ) { backStackEntry ->
                    val category = backStackEntry.arguments?.getString("category")
                    val collection = backStackEntry.arguments?.getString("collection")
                    val gridViewModel: StylesGridViewModel = viewModel(
                        factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                            override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                                @Suppress("UNCHECKED_CAST")
                                return StylesGridViewModel(styleRepository, category, collection) as T
                            }
                        }
                    )
                    StylesGridScreen(
                        viewModel = gridViewModel,
                        onBackClick = { navController.popBackStack() },
                        onStyleClick = { id -> navController.navigate(Screen.StyleDetails.createRoute(id)) }
                    )
                }
            }

            androidx.compose.animation.AnimatedVisibility(
                visible = isBottomBarVisible,
                modifier = Modifier.align(Alignment.BottomCenter),
                enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
                exit = slideOutVertically(targetOffsetY = { it }) + fadeOut()
            ) {
                PicMeBottomNavigationBar(
                    currentRoute = currentRoute,
                    onNavigate = { route ->
                        navController.navigate(route) {
                            popUpTo(Screen.Home.route) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    }
                )
            }
        }

        // Shared Banner Slot: Takes physical space ONLY when visible.
        BannerAdView(modifier = Modifier.fillMaxWidth())
    }
}

private fun canNavigateFromSplash(authState: AuthState): Boolean = 
    authState is AuthState.Authenticated || 
    authState is AuthState.Unauthenticated || 
    authState is AuthState.RestoringSession

private fun navigateFromSplash(navController: NavHostController, authState: AuthState, prefs: SharedPreferences) {
    val isOnboardingCompleted = prefs.getBoolean("onboarding_completed", false)
    val destination = when {
        authState is AuthState.Authenticated || authState is AuthState.RestoringSession -> Screen.Home.route
        !isOnboardingCompleted -> Screen.Onboarding.route
        else -> Screen.Login.route
    }
    navController.navigate(destination) { popUpTo(Screen.Splash.route) { inclusive = true } }
}
