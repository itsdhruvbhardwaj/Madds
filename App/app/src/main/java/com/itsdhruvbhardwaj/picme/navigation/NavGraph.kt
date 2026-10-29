package com.itsdhruvbhardwaj.picme.navigation

import android.content.Context
import android.content.SharedPreferences
import android.widget.Toast
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
import androidx.navigation.navDeepLink
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.auth.GoogleAuthHelper
import com.itsdhruvbhardwaj.picme.ui.auth.PasswordSetupState
import com.itsdhruvbhardwaj.picme.ui.components.BannerAdView
import com.itsdhruvbhardwaj.picme.ui.components.PicMeBottomNavigationBar
import com.itsdhruvbhardwaj.picme.ui.screens.auth.ForgotPasswordScreen
import com.itsdhruvbhardwaj.picme.ui.screens.auth.LoginScreen
import com.itsdhruvbhardwaj.picme.ui.screens.auth.ResetPasswordScreen
import com.itsdhruvbhardwaj.picme.ui.screens.auth.SignupScreen
import com.itsdhruvbhardwaj.picme.ui.screens.auth.VerifyEmailScreen
import com.itsdhruvbhardwaj.picme.ui.screens.create.CreateScreen
import com.itsdhruvbhardwaj.picme.ui.screens.create.GenerationScreen
import com.itsdhruvbhardwaj.picme.ui.screens.create.GenerationUiState
import com.itsdhruvbhardwaj.picme.ui.screens.create.GenerationViewModel
import com.itsdhruvbhardwaj.picme.ui.screens.create.ResultScreen
import com.itsdhruvbhardwaj.picme.ui.screens.create.SelectPhotosScreen
import com.itsdhruvbhardwaj.picme.ui.screens.home.*
import com.itsdhruvbhardwaj.picme.ui.screens.onboarding.OnboardingScreen
import com.itsdhruvbhardwaj.picme.ui.screens.profile.ProfileScreen
import com.itsdhruvbhardwaj.picme.ui.screens.search.ExploreScreen
import com.itsdhruvbhardwaj.picme.ui.screens.search.ExploreViewModel
import com.itsdhruvbhardwaj.picme.ui.screens.settings.DeleteAccountScreen
import com.itsdhruvbhardwaj.picme.ui.screens.settings.SettingsScreen
import com.itsdhruvbhardwaj.picme.ui.screens.splash.SplashScreen
import kotlinx.coroutines.flow.collectLatest

@Composable
fun NavGraph(
    navController: NavHostController,
    authViewModel: AuthViewModel,
    homeViewModel: HomeViewModel,
    collectionsViewModel: CollectionsViewModel,
    generationViewModel: GenerationViewModel,
    favoritesViewModel: FavoritesViewModel,
    exploreViewModel: ExploreViewModel,
    styleRepository: StyleRepository
) {
    val context = LocalContext.current
    val prefs = context.getSharedPreferences("picme_prefs", Context.MODE_PRIVATE)

    val authState by authViewModel.authState.collectAsState()
    val passwordSetupState by authViewModel.passwordSetupState.collectAsState()
    val isDeletionCancellationLoading by authViewModel.isDeletionCancellationLoading.collectAsState()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val scope = rememberCoroutineScope()
    val googleAuthHelper = remember { GoogleAuthHelper(context) }

    // Unified UI Event Handling (Toasts for success/failure)
    LaunchedEffect(Unit) {
        authViewModel.uiEvent.collectLatest { message ->
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
        }
    }

    // Synchronize credits balance with generation lifecycle using silent refresh
    LaunchedEffect(Unit) {
        generationViewModel.onProfileRefreshRequested = {
            authViewModel.checkSession(isInitial = true)
        }
    }

    val bottomBarScreens = listOf(
        Screen.Home.route,
        Screen.Favorites.route,
        Screen.Collections.route,
        Screen.Search.route,
        Screen.Profile.route
    )
    fun isBottomBarRoute(route: String?) = route != null && route in bottomBarScreens

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
                modifier = Modifier.fillMaxSize(),
                enterTransition = {
                    if (isBottomBarRoute(targetState.destination.route)) EnterTransition.None else fadeIn()
                },
                exitTransition = {
                    if (isBottomBarRoute(initialState.destination.route) && isBottomBarRoute(targetState.destination.route)) {
                        ExitTransition.None
                    } else {
                        fadeOut()
                    }
                },
                popEnterTransition = {
                    if (isBottomBarRoute(targetState.destination.route)) EnterTransition.None else fadeIn()
                },
                popExitTransition = {
                    if (isBottomBarRoute(initialState.destination.route) && isBottomBarRoute(targetState.destination.route)) {
                        ExitTransition.None
                    } else {
                        fadeOut()
                    }
                }
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
                        onSignUpClick = { navController.navigate(Screen.Signup.route) },
                        onGoogleClick = {
                            googleAuthHelper.signIn(
                                scope = scope,
                                onSuccess = { idToken -> authViewModel.loginWithGoogle(idToken) },
                                onError = { error -> Toast.makeText(context, error, Toast.LENGTH_LONG).show() }
                            )
                        },
                        onForgotPasswordClick = { email ->
                            navController.navigate(Screen.ForgotPassword.createRoute(email))
                        },
                        onCancelDeletion = { authViewModel.cancelDeletion() },
                        onKeepDeletion = { authViewModel.resetAuthState() },
                        onDismissDeletionDialog = { authViewModel.resetAuthState() },
                        isDeletionCancellationLoading = isDeletionCancellationLoading
                    )
                    LaunchedEffect(authState, currentRoute) {
                        if (currentRoute == Screen.Login.route && authState is AuthState.Authenticated) {
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
                        onBackClick = { navController.popBackStack() },
                        onGoogleClick = {
                            googleAuthHelper.signIn(
                                scope = scope,
                                onSuccess = { idToken -> authViewModel.loginWithGoogle(idToken) },
                                onError = { error -> Toast.makeText(context, error, Toast.LENGTH_LONG).show() }
                            )
                        }
                    )
                    LaunchedEffect(authState, currentRoute) {
                        if (currentRoute != Screen.Signup.route) return@LaunchedEffect
                        val state = authState
                        if (state is AuthState.Authenticated) {
                            navController.navigate(Screen.Home.route) {
                                popUpTo(Screen.Signup.route) { inclusive = true }
                            }
                        } else if (state is AuthState.VerifyEmailRequired) {
                            navController.navigate(Screen.VerifyEmail.createRoute(state.email)) {
                                popUpTo(Screen.Signup.route)
                            }
                        }
                    }
                }

                composable(Screen.Home.route) {
                    HomeScreen(
                        authViewModel = authViewModel,
                        viewModel = homeViewModel,
                        onStyleClick = { id -> navController.navigate(Screen.StyleDetails.createRoute(id)) },
                        onSeeAllClick = { collection -> navController.navigate(Screen.StylesGrid.createRoute(collection)) },
                        onProfileClick = {
                            navController.navigate(Screen.Profile.route) {
                                popUpTo(Screen.Home.route) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }

                composable(Screen.Search.route) {
                    ExploreScreen(
                        authViewModel = authViewModel,
                        viewModel = exploreViewModel,
                        onStyleClick = { id -> navController.navigate(Screen.StyleDetails.createRoute(id)) },
                        onProfileClick = {
                            navController.navigate(Screen.Profile.route) {
                                popUpTo(Screen.Home.route) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }

                composable(Screen.Collections.route) {
                    CollectionsScreen(
                        authViewModel = authViewModel,
                        viewModel = collectionsViewModel,
                        onCollectionClick = { collection ->
                            navController.navigate(Screen.StylesGrid.createRoute(collection))
                        },
                        onProfileClick = {
                            navController.navigate(Screen.Profile.route) {
                                popUpTo(Screen.Home.route) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }

                composable(Screen.Favorites.route) {
                    FavoritesScreen(
                        authViewModel = authViewModel,
                        viewModel = favoritesViewModel,
                        onStyleClick = { id -> navController.navigate(Screen.StyleDetails.createRoute(id)) },
                        onProfileClick = {
                            navController.navigate(Screen.Profile.route) {
                                popUpTo(Screen.Home.route) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }

                composable(Screen.Create.route) {
                    CreateScreen(
                        authViewModel = authViewModel,
                        onGenerateClick = { prompt, uris ->
                            generationViewModel.setSelectedPhotos(uris)
                            navController.navigate(Screen.Generation.createRoute("custom", prompt))
                        },
                        onProfileClick = {
                            navController.navigate(Screen.Profile.route) {
                                popUpTo(Screen.Home.route) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                }

                composable(Screen.Profile.route) {
                    ProfileScreen(
                        authViewModel = authViewModel,
                        onLogoutClick = {
                            // Navigate first to avoid flicker of "User" state on Profile screen
                            navController.navigate(Screen.Login.route) {
                                popUpTo(Screen.Splash.route) { inclusive = true }
                            }
                            authViewModel.logout()
                        },
                        onSettingsClick = { navController.navigate(Screen.Settings.route) },
                        onProfileClick = {
                            navController.navigate(Screen.Profile.route) {
                                popUpTo(Screen.Home.route) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        onNavigateToMyGenerations = { navController.navigate(Screen.History.route) }
                    )
                }

                composable(Screen.Settings.route) {
                    SettingsScreen(
                        authViewModel = authViewModel,
                        onBackClick = { navController.popBackStack() },
                        onDeleteAccountClick = { navController.navigate(Screen.DeleteAccount.route) }
                    )
                }

                composable(Screen.DeleteAccount.route) {
                    val deletionUser = (authState as? AuthState.Authenticated)?.user
                    DeleteAccountScreen(
                        authState = authState,
                        passwordSetupState = passwordSetupState,
                        onBackClick = { navController.popBackStack() },
                        hasPassword = deletionUser?.hasPassword == true,
                        hasGoogleLogin = deletionUser?.hasGoogleLogin == true,
                        onSubmitDelete = { password -> authViewModel.deleteAccount(password) },
                        onRequestPasswordSetup = { password, confirm -> authViewModel.requestGooglePasswordSetup(password, confirm) },
                        onRefreshPasswordSetup = { authViewModel.refreshGooglePasswordSetupStatus() }
                    )

                    // Exit flow on successful deletion request (Unauthenticated means tokens cleared)
                    LaunchedEffect(authState) {
                        if (authState is AuthState.Unauthenticated) {
                            navController.navigate(Screen.Login.route) {
                                popUpTo(Screen.Splash.route) { inclusive = true }
                            }
                        }
                    }
                }

                composable(
                    route = Screen.VerifyGooglePasswordSetup.route,
                    arguments = listOf(navArgument("token") { type = NavType.StringType; nullable = true }),
                    deepLinks = listOf(
                        navDeepLink {
                            uriPattern = "https://picme-ai.onrender.com/api/auth/google/password/verify?token={token}"
                        }
                    )
                ) { backStackEntry ->
                    val token = backStackEntry.arguments?.getString("token")
                    LaunchedEffect(token) {
                        if (!token.isNullOrBlank()) authViewModel.verifyGooglePasswordSetup(token)
                    }
                    Column(
                        modifier = androidx.compose.ui.Modifier.fillMaxSize().padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = when (passwordSetupState) {
                                PasswordSetupState.Verifying -> "Verifying your email and setting your password…"
                                PasswordSetupState.Verified -> "Email verified. Your password is set. Return to account deletion and confirm with this password."
                                is PasswordSetupState.Error -> (passwordSetupState as PasswordSetupState.Error).message
                                else -> "Open madds to finish verifying your password."
                            },
                            style = MaterialTheme.typography.bodyLarge
                        )
                        Spacer(modifier = androidx.compose.ui.Modifier.height(20.dp))
                        Button(onClick = { navController.navigate(Screen.DeleteAccount.route) }) {
                            Text("Continue")
                        }
                    }
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
                    arguments = listOf(
                        navArgument("styleId") { type = NavType.StringType },
                        navArgument("prompt") { type = NavType.StringType; nullable = true }
                    )
                ) { backStackEntry ->
                    val styleId = backStackEntry.arguments?.getString("styleId") ?: ""
                    val prompt = backStackEntry.arguments?.getString("prompt")
                    val genState by generationViewModel.uiState.collectAsState()
                    val statusMsg by generationViewModel.statusMessage.collectAsState()
                    val selectedPhotos by generationViewModel.selectedPhotos.collectAsState()

                    LaunchedEffect(Unit) {
                        if (styleId == "custom" && prompt != null) {
                            generationViewModel.generateCustomImage(prompt)
                        } else {
                            generationViewModel.generateImage(styleId)
                        }
                    }

                    GenerationScreen(
                        state = genState,
                        statusMessage = statusMsg,
                        selectedPhotos = selectedPhotos,
                        onCancelClick = {
                            generationViewModel.resetState()
                            navController.popBackStack()
                        },
                        onRetryClick = {
                            if (styleId == "custom" && prompt != null) {
                                generationViewModel.generateCustomImage(prompt, isRetry = true)
                            } else {
                                generationViewModel.generateImage(styleId, isRetry = true)
                            }
                        },
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
                        onVerifyClick = { authViewModel.verifyEmail(it) },
                        onResendClick = { email?.let { authViewModel.resendVerification(it) } },
                        onBackClick = {
                            authViewModel.resetAuthState()
                            navController.popBackStack()
                        }
                    )
                    LaunchedEffect(authState, currentRoute) {
                        if (currentRoute == Screen.VerifyEmail.route && authState is AuthState.Authenticated) {
                            navController.navigate(Screen.Home.route) {
                                popUpTo(Screen.Splash.route) { inclusive = true }
                            }
                        }
                    }
                }

                composable(
                    route = Screen.ForgotPassword.route,
                    arguments = listOf(
                        navArgument("email") { type = NavType.StringType; nullable = true }
                    )
                ) { backStackEntry ->
                    val email = backStackEntry.arguments?.getString("email")
                    ForgotPasswordScreen(
                        initialEmail = email,
                        authState = authState,
                        onSubmitClick = { authViewModel.forgotPassword(it) },
                        onBackClick = {
                            authViewModel.resetAuthState()
                            navController.popBackStack()
                        }
                    )
                }

                composable(
                    route = Screen.ResetPassword.route,
                    arguments = listOf(
                        navArgument("token") { type = NavType.StringType; nullable = true }
                    ),
                    deepLinks = listOf(
                        navDeepLink {
                            uriPattern = "https://picme-ai.onrender.com/api/auth/reset-password?token={token}"
                        }
                    )
                ) { backStackEntry ->
                    val token = backStackEntry.arguments?.getString("token") ?: ""
                    ResetPasswordScreen(
                        token = token,
                        authState = authState,
                        onSubmitClick = { t, p -> authViewModel.resetPassword(t, p) },
                        onBackClick = {
                            authViewModel.resetAuthState()
                            navController.popBackStack()
                        },
                        onSuccess = {
                            Toast.makeText(context, "Password reset successfully. Please sign in.", Toast.LENGTH_LONG).show()
                            navController.navigate(Screen.Login.route) {
                                popUpTo(Screen.Splash.route) { inclusive = true }
                            }
                            authViewModel.resetAuthState()
                        }
                    )
                }

                composable(
                    route = Screen.StylesGrid.route,
                    arguments = listOf(
                        navArgument("collection") { type = NavType.StringType; nullable = true }
                    )
                ) { backStackEntry ->
                    val collection = backStackEntry.arguments?.getString("collection")
                    val gridViewModel: StylesGridViewModel = viewModel(
                        factory = object : androidx.lifecycle.ViewModelProvider.Factory {
                            override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                                @Suppress("UNCHECKED_CAST")
                                return StylesGridViewModel(styleRepository, collection) as T
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
