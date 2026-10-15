package com.itsdhruvbhardwaj.picme.navigation

import android.content.Context
import androidx.compose.animation.*
import androidx.compose.animation.core.animateDpAsState
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
import androidx.navigation.navDeepLink
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

    Scaffold(
        bottomBar = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Shared Banner Ad - Always present in the hierarchy, but hides itself if no ad is loaded
                BannerAdView(modifier = Modifier.fillMaxWidth())

                AnimatedVisibility(
                    visible = isBottomBarVisible,
                    enter = slideInVertically(
                        initialOffsetY = { it },
                        animationSpec = tween(durationMillis = 300)
                    ) + fadeIn(animationSpec = tween(durationMillis = 300)),
                    exit = slideOutVertically(
                        targetOffsetY = { it },
                        animationSpec = tween(durationMillis = 300)
                    ) + fadeOut(animationSpec = tween(durationMillis = 300))
                ) {
                    PicMeBottomNavigationBar(
                        currentRoute = currentRoute,
                        onNavigate = { route ->
                            navController.navigate(route) {
                                // Standard top-level navigation behavior
                                popUpTo(Screen.Home.route) { 
                                    saveState = true 
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }
            }
        }
    ) { innerPadding ->
        // Animate bottom padding to avoid abrupt height changes when showing/hiding bottom bar or banner
        // We use innerPadding.calculateBottomPadding() to automatically account for the banner height
        // and the bottom navigation bar when visible.
        val animatedBottomPadding by animateDpAsState(
            targetValue = innerPadding.calculateBottomPadding(),
            animationSpec = tween(durationMillis = 300),
            label = "bottomPaddingAnimation"
        )
        
        Box(modifier = Modifier.padding(bottom = animatedBottomPadding)) {
            NavHost(
                navController = navController,
                startDestination = Screen.Splash.route
            ) {
                composable(Screen.Splash.route) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        SplashScreen(onSplashFinished = {
                            if (canNavigateFromSplash(authState)) {
                                navigateFromSplash(navController, authState, prefs)
                            }
                        })

                        if (authState is AuthState.SessionCheckNetworkError) {
                            Surface(
                                modifier = Modifier.fillMaxSize(),
                                color = Color.Black.copy(alpha = 0.7f)
                            ) {
                                Column(
                                    modifier = Modifier.fillMaxSize(),
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center
                                ) {
                                    Text(
                                        text = "Connection Error",
                                        style = MaterialTheme.typography.titleLarge,
                                        color = Color.White
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text(
                                        text = "Unable to check session. Please check your internet.",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = Color.White.copy(alpha = 0.8f),
                                        modifier = Modifier.padding(horizontal = 48.dp),
                                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                    )
                                    Spacer(modifier = Modifier.height(24.dp))
                                    Button(onClick = { authViewModel.checkSession() }) {
                                        Text("Retry")
                                    }
                                }
                            }
                        }
                    }

                    LaunchedEffect(authState) {
                        if (canNavigateFromSplash(authState) && currentRoute == Screen.Splash.route) {
                            navigateFromSplash(navController, authState, prefs)
                        }
                    }
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
                    LaunchedEffect(Unit) {
                        authViewModel.resetAuthState()
                    }

                    LoginScreen(
                        authState = authState,
                        onLoginClick = { email, password -> 
                            authViewModel.login(email, password)
                        },
                        onResendVerificationClick = { email ->
                            authViewModel.resendVerification(email)
                        },
                        onGoogleClick = { /* Handle Google Login */ },
                        onSignUpClick = { 
                            navController.navigate(Screen.Signup.route) 
                        },
                        onForgotPasswordClick = { /* Handle Forgot Password */ }
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
                    LaunchedEffect(Unit) {
                        authViewModel.resetAuthState()
                    }

                    SignupScreen(
                        authState = authState,
                        onSignupClick = { name, email, password -> 
                            authViewModel.signup(name, email, password)
                        },
                        onGoogleClick = { /* Handle Google Login */ },
                        onSignInClick = { 
                            navController.navigate(Screen.Login.route) 
                        },
                        onBackClick = { navController.popBackStack() }
                    )
                    
                    LaunchedEffect(authState) {
                        if (authState is AuthState.VerifyEmailRequired) {
                            val email = (authState as AuthState.VerifyEmailRequired).email
                            navController.navigate(Screen.VerifyEmail.createRoute(email = email)) {
                                popUpTo(Screen.Signup.route) { inclusive = true }
                            }
                        }
                    }
                }

                composable(
                    route = Screen.VerifyEmail.route,
                    arguments = listOf(
                        navArgument("email") { 
                            type = NavType.StringType
                            nullable = true
                            defaultValue = null
                        },
                        navArgument("token") {
                            type = NavType.StringType
                            nullable = true
                            defaultValue = null
                        }
                    ),
                    deepLinks = listOf(
                        navDeepLink {
                            uriPattern = "https://picme-ai.onrender.com/api/auth/verify-email?token={token}"
                        }
                    )
                ) { backStackEntry ->
                    val email = backStackEntry.arguments?.getString("email")
                    val token = backStackEntry.arguments?.getString("token")
                    VerifyEmailScreen(
                        email = email,
                        token = token,
                        authState = authState,
                        onVerifyClick = { verificationToken -> authViewModel.verifyEmail(verificationToken) },
                        onResendClick = { 
                            email?.let { authViewModel.resendVerification(it) }
                        },
                        onBackClick = { navController.popBackStack() }
                    )
                    
                    LaunchedEffect(authState) {
                        if (authState is AuthState.Authenticated) {
                            navController.navigate(Screen.Home.route) {
                                popUpTo(Screen.VerifyEmail.route) { inclusive = true }
                            }
                        } else if (authState is AuthState.VerificationSuccess) {
                            authViewModel.resetAuthState()
                            navController.navigate(Screen.Login.route) {
                                popUpTo(Screen.VerifyEmail.route) { inclusive = true }
                            }
                        }
                    }
                }

                composable(Screen.Home.route) {
                    HomeScreen(
                        authViewModel = authViewModel,
                        viewModel = homeViewModel,
                        onStyleClick = { styleId ->
                            navController.navigate(Screen.StyleDetails.createRoute(styleId))
                        },
                        onSeeAllClick = { category, collection ->
                            navController.navigate(Screen.StylesGrid.createRoute(category, collection))
                        },
                        onProfileClick = { 
                            // Standardize Profile navigation to match bottom bar behavior
                            navController.navigate(Screen.Profile.route) {
                                popUpTo(Screen.Home.route) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )

                    LaunchedEffect(authState) {
                        if (authState is AuthState.Unauthenticated) {
                            navController.navigate(Screen.Login.route) {
                                popUpTo(Screen.Home.route) { inclusive = true }
                            }
                        }
                    }
                }

                composable(
                    route = Screen.StylesGrid.route,
                    arguments = listOf(
                        navArgument("category") {
                            type = NavType.StringType
                            nullable = true
                        },
                        navArgument("collection") {
                            type = NavType.StringType
                            nullable = true
                        }
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
                        onStyleClick = { styleId ->
                            navController.navigate(Screen.StyleDetails.createRoute(styleId))
                        }
                    )
                }

                composable(
                    route = Screen.StyleDetails.route,
                    arguments = listOf(
                        navArgument("styleId") { type = NavType.StringType }
                    )
                ) { backStackEntry ->
                    val styleId = backStackEntry.arguments?.getString("styleId") ?: ""
                    val detailsViewModel: StyleDetailsViewModel = viewModel(
                        factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                            override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                                @Suppress("UNCHECKED_CAST")
                                return StyleDetailsViewModel(styleRepository, styleId) as T
                            }
                        }
                    )
                    StyleDetailsScreen(
                        authViewModel = authViewModel,
                        viewModel = detailsViewModel,
                        onBackClick = { navController.popBackStack() },
                        onTryStyleClick = { id -> 
                            navController.navigate(Screen.SelectPhotos.createRoute(id)) 
                        }
                    )
                }

                composable(
                    route = Screen.SelectPhotos.route,
                    arguments = listOf(
                        navArgument("styleId") { type = NavType.StringType }
                    )
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
                    arguments = listOf(
                        navArgument("styleId") { type = NavType.StringType }
                    )
                ) { backStackEntry ->
                    val styleId = backStackEntry.arguments?.getString("styleId") ?: ""
                    val genState by generationViewModel.uiState.collectAsState()
                    val statusMsg by generationViewModel.statusMessage.collectAsState()
                    val selectedPhotos by generationViewModel.selectedPhotos.collectAsState()
                    val isInterstitialVisible by generationViewModel.isInterstitialVisible.collectAsState()

                    LaunchedEffect(Unit) {
                        generationViewModel.generateImage(styleId)
                    }

                    GenerationScreen(
                        state = genState,
                        statusMessage = statusMsg,
                        selectedPhotos = selectedPhotos,
                        isInterstitialVisible = isInterstitialVisible,
                        onAdShow = { generationViewModel.setInterstitialVisible(true) },
                        onAdDismiss = { generationViewModel.setInterstitialVisible(false) },
                        onCancelClick = { 
                            generationViewModel.resetState()
                            navController.popBackStack() 
                        },
                        onRetryClick = { 
                            val state = generationViewModel.uiState.value
                            if (state is GenerationUiState.Error) {
                                generationViewModel.generateImage(styleId, isRetry = state.isAmbiguous)
                            } else {
                                generationViewModel.generateImage(styleId)
                            }
                        },
                        onSuccess = { imageBase64 ->
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
                            navController.navigate(Screen.Home.route) {
                                popUpTo(Screen.Home.route) { inclusive = true }
                            }
                        },
                        onSaveClick = { generationViewModel.saveImageToGallery(context) },
                        onShareClick = { generationViewModel.shareImage(context) },
                        onGenerateAgainClick = { 
                            generationViewModel.resetState()
                            navController.popBackStack() 
                        }
                    )
                }

                composable(Screen.Profile.route) {
                    ProfileScreen(
                        authViewModel = authViewModel,
                        onLogoutClick = {
                            authViewModel.logout()
                        },
                        onSettingsClick = { /* Handle Settings */ },
                        onNavigateToMyGenerations = { navController.navigate(Screen.History.route) }
                    )
                    
                    LaunchedEffect(authState) {
                        if (authState is AuthState.Unauthenticated) {
                            navController.navigate(Screen.Login.route) {
                                popUpTo(Screen.Home.route) { inclusive = true }
                            }
                        }
                    }
                }
                
                composable(Screen.Explore.route) { /* Explore Screen placeholder */ }
                composable(Screen.History.route) { /* History Screen placeholder */ }
                composable(Screen.Create.route) { /* Direct Create route if needed */ }
            }
        }
    }
}

private fun canNavigateFromSplash(authState: AuthState): Boolean {
    return authState is AuthState.Authenticated || 
           authState is AuthState.Unauthenticated || 
           authState is AuthState.RestoringSession
}

private fun navigateFromSplash(
    navController: NavHostController,
    authState: AuthState,
    prefs: android.content.SharedPreferences
) {
    val isOnboardingCompleted = prefs.getBoolean("onboarding_completed", false)
    val destination = when {
        authState is AuthState.Authenticated || authState is AuthState.RestoringSession -> Screen.Home.route
        !isOnboardingCompleted -> Screen.Onboarding.route
        else -> Screen.Login.route
    }
    navController.navigate(destination) {
        popUpTo(Screen.Splash.route) { inclusive = true }
    }
}
