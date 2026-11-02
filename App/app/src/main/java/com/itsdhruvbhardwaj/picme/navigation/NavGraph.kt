package com.itsdhruvbhardwaj.picme.navigation

import android.content.Context
import android.app.Activity
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
import com.itsdhruvbhardwaj.picme.ui.screens.profile.FeedbackScreen
import com.itsdhruvbhardwaj.picme.ui.screens.profile.AvatarSelectionScreen
import com.itsdhruvbhardwaj.picme.ui.screens.profile.MyGenerationsScreen
import com.itsdhruvbhardwaj.picme.ui.screens.profile.AccountHistoryScreen
import com.itsdhruvbhardwaj.picme.ui.screens.search.ExploreScreen
import com.itsdhruvbhardwaj.picme.ui.screens.search.ExploreViewModel
import com.itsdhruvbhardwaj.picme.ui.screens.settings.DeleteAccountScreen
import com.itsdhruvbhardwaj.picme.ui.screens.settings.SettingsScreen
import com.itsdhruvbhardwaj.picme.ui.screens.settings.CreatePasswordScreen
import com.itsdhruvbhardwaj.picme.ui.screens.settings.NotificationSettingsScreen
import com.itsdhruvbhardwaj.picme.notifications.*
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import androidx.activity.compose.BackHandler
import com.itsdhruvbhardwaj.picme.ui.screens.splash.SplashScreen
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.flow.first
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.itsdhruvbhardwaj.picme.ui.components.GenerationHeaderState
import com.itsdhruvbhardwaj.picme.ui.components.LocalGenerationHeaderState
import com.itsdhruvbhardwaj.picme.utils.AdManager
import com.itsdhruvbhardwaj.picme.utils.MainScreenAdTimer
import android.os.SystemClock
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.supervisorScope

@Composable
fun NavGraph(
    navController: NavHostController,
    authViewModel: AuthViewModel,
    homeViewModel: HomeViewModel,
    collectionsViewModel: CollectionsViewModel,
    generationViewModel: GenerationViewModel,
    favoritesViewModel: FavoritesViewModel,
    exploreViewModel: ExploreViewModel,
    styleRepository: StyleRepository,
    notificationPreferencesViewModel: NotificationPreferencesViewModel,
    pendingNotificationId: String? = null,
    onNotificationHandled: () -> Unit = {},
    pendingGeneration: String? = null,
    onGenerationNotificationHandled: () -> Unit = {}
) {
    val context = LocalContext.current
    val prefs = context.getSharedPreferences("picme_prefs", Context.MODE_PRIVATE)

    val authState by authViewModel.authState.collectAsState()
    val passwordSetupState by authViewModel.passwordSetupState.collectAsState()
    val isDeletingAccount by authViewModel.isDeletingAccount.collectAsState()
    val isDeletionCancellationLoading by authViewModel.isDeletionCancellationLoading.collectAsState()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route
    val pushLocalState = remember { PushLocalState(context.applicationContext) }
    val pushAuth = remember { AuthTokenStorage(context.applicationContext) }
    LaunchedEffect(pendingNotificationId, authState, currentRoute) {
        val id = pendingNotificationId ?: return@LaunchedEffect
        if (authState is AuthState.Unauthenticated) { onNotificationHandled(); return@LaunchedEffect }
        val signedIn = (authState as? AuthState.Authenticated)?.user ?: return@LaunchedEffect
        if (currentRoute == null || currentRoute in listOf(Screen.Splash.route, Screen.Login.route, Screen.Signup.route, Screen.Onboarding.route) ||
            signedIn.profileSetupComplete == false) return@LaunchedEffect
        val payload = pushLocalState.tap(id, pushAuth)
        if (payload != null) {
            val route = when {
                payload.styleId != null -> Screen.StyleDetails.createRoute(payload.styleId)
                payload.collectionId != null -> Screen.NotificationCollection.createRoute(payload.collectionId)
                else -> Screen.Home.route
            }
            navController.navigate(route) { launchSingleTop = true }
            pushLocalState.markOpened(id)
        }
        onNotificationHandled()
    }

    val scope = rememberCoroutineScope()
    var isAppRefreshing by remember { mutableStateOf(false) }
    var profileSetupOfferedForUser by remember { mutableStateOf<String?>(null) }
    val refreshApp: () -> Unit = {
        if (!isAppRefreshing) {
            isAppRefreshing = true
            scope.launch {
                try {
                    supervisorScope {
                        launch { homeViewModel.loadHomeData().join() }
                        launch { authViewModel.checkSession(isInitial = true).join() }
                        launch { collectionsViewModel.loadCollections(force = true).join() }
                        launch { favoritesViewModel.loadFavorites().join() }
                        launch { exploreViewModel.refresh().join() }
                    }
                } finally {
                    isAppRefreshing = false
                }
            }
        }
    }
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

    val generationOwner = (authState as? AuthState.Authenticated)?.user?.id
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(generationOwner, lifecycleOwner) {
        generationViewModel.bindAccount(generationOwner)
        if (generationOwner != null) lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) {
                generationViewModel.refreshOperations()
                if (generationViewModel.operations.value.isEmpty()) {
                    withTimeoutOrNull(60_000) { generationViewModel.operations.first { it.isNotEmpty() } }
                } else delay(12_000)
            }
        }
    }
    val recoverableGenerations by generationViewModel.operations.collectAsState()
    LaunchedEffect(pendingGeneration, generationOwner, currentRoute) {
        val parts = pendingGeneration?.split(":") ?: return@LaunchedEffect
        if (generationOwner == null || currentRoute == Screen.Splash.route) return@LaunchedEffect
        if (parts.size == 2 && parts[0] == generationOwner && Regex("[a-fA-F0-9]{24}").matches(parts[1])) {
            generationViewModel.openOperation(parts[1])
            navController.navigate(Screen.Generation.createRoute("recovery")) { launchSingleTop = true }
        }
        onGenerationNotificationHandled()
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
    val mainAdTimer = remember(generationOwner) { MainScreenAdTimer() }
    LaunchedEffect(isBottomBarVisible, generationOwner, lifecycleOwner) {
        if (isBottomBarVisible && generationOwner != null) {
            lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
                mainAdTimer.enter(SystemClock.elapsedRealtime())
                try {
                    AdManager.loadInterstitial(context)
                    awaitCancellation()
                } finally { mainAdTimer.leave(SystemClock.elapsedRealtime()) }
            }
        }
    }

    val headerState = GenerationHeaderState(
        items = if (generationOwner != null && isBottomBarVisible) recoverableGenerations else emptyList(),
        onOpen = { id ->
            generationViewModel.openOperation(id)
            navController.navigate(Screen.Generation.createRoute("recovery")) { launchSingleTop = true }
        }
    )
    CompositionLocalProvider(LocalGenerationHeaderState provides headerState) {
    // Global Layout: Banner pushes content up physically.
    Column(
        modifier = Modifier
            .fillMaxSize()
            // Keep controls clear of navigation bars and landscape cutouts.
            // Screens and headers own the top inset so their backgrounds can
            // continue behind the transparent status bar.
            .windowInsetsPadding(
                WindowInsets.systemBars.union(WindowInsets.displayCutout)
                    .only(WindowInsetsSides.Horizontal + WindowInsetsSides.Bottom)
            )
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
                    val profileUser = (authState as? AuthState.Authenticated)?.user
                    LaunchedEffect(profileUser?.id, profileUser?.profileSetupComplete) {
                        if (profileUser?.profileSetupComplete == false && profileSetupOfferedForUser != profileUser.id) {
                            profileSetupOfferedForUser = profileUser.id
                            navController.navigate(Screen.EditAvatar.route) { launchSingleTop = true }
                        }
                    }
                    HomeScreen(
                        authViewModel = authViewModel,
                        viewModel = homeViewModel,
                        isRefreshing = isAppRefreshing,
                        onRefresh = refreshApp,
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
                            generationViewModel.generateCustomImage(prompt)
                            navController.navigate(Screen.Generation.createRoute("custom", prompt)) { launchSingleTop = true }
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
                        onEditAvatar = { navController.navigate(Screen.EditAvatar.route) },
                        onSendFeedback = { navController.navigate(Screen.Feedback.route) },
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
                        onNavigateToMyGenerations = { navController.navigate(Screen.History.route) },
                        onNavigateToPurchases = { navController.navigate(Screen.Purchases.route) },
                        onNavigateToCreditHistory = { navController.navigate(Screen.CreditHistory.route) }
                    )
                }

                composable(Screen.Feedback.route) {
                    FeedbackScreen(authViewModel, onBack = { navController.popBackStack() })
                }
                composable(Screen.Purchases.route) {
                    AccountHistoryScreen(authViewModel, purchases = true, onBack = { navController.popBackStack() })
                }
                composable(Screen.CreditHistory.route) {
                    AccountHistoryScreen(authViewModel, purchases = false, onBack = { navController.popBackStack() })
                }

                composable(Screen.EditAvatar.route) {
                    AvatarSelectionScreen(authViewModel, onBack = { navController.popBackStack() })
                }

                composable(Screen.History.route) {
                    MyGenerationsScreen(
                        onBackClick = { navController.popBackStack() }
                    )
                }

                composable(Screen.Settings.route) {
                    SettingsScreen(
                        authViewModel = authViewModel,
                        onBackClick = { navController.popBackStack() },
                        onDeleteAccountClick = { navController.navigate(Screen.DeleteAccount.route) },
                        onNotificationsClick = { navController.navigate(Screen.NotificationSettings.route) },
                        onCreatePasswordClick = {
                            authViewModel.resetPasswordSetupState()
                            navController.navigate(Screen.CreatePassword.route) { launchSingleTop = true }
                        }
                    )
                }

                composable(Screen.NotificationSettings.route) {
                    NotificationSettingsScreen((authState as? AuthState.Authenticated)?.user?.id,
                        notificationPreferencesViewModel, onBack = { navController.popBackStack() })
                }
                composable(Screen.NotificationCollection.route, arguments = listOf(navArgument("collectionId") { type = NavType.StringType })) { entry ->
                    val id = entry.arguments?.getString("collectionId").orEmpty()
                    var message by remember(id) { mutableStateOf<String?>(null) }
                    var attempt by remember(id) { mutableIntStateOf(0) }
                    LaunchedEffect(id, attempt) {
                        message = null
                        val result = styleRepository.getCollections()
                        val collection = result.getOrNull()?.find { it.id == id }
                        if (collection != null) navController.navigate(Screen.StylesGrid.createRoute(collection.name)) {
                            popUpTo(Screen.NotificationCollection.route) { inclusive = true }; launchSingleTop = true
                        } else message = if (result.isFailure) "Couldn't load this collection. Please try again." else "This collection is no longer available."
                    }
                    Scaffold(topBar = { com.itsdhruvbhardwaj.picme.ui.components.PicMeCompactHeader(title = "Collection", onBackClick = { navController.popBackStack() }) }) { padding ->
                        Column(Modifier.fillMaxSize().padding(padding).padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center) {
                            if (message == null) CircularProgressIndicator() else { Text(message.orEmpty()); TextButton(onClick = { attempt++ }) { Text("Try again") } }
                        }
                    }
                }
                composable(Screen.CreatePassword.route) {
                    CreatePasswordScreen(
                        user = (authState as? AuthState.Authenticated)?.user,
                        state = passwordSetupState,
                        onBack = { returnToSettings(navController) },
                        onSend = authViewModel::requestGooglePasswordSetup,
                        onRefresh = authViewModel::refreshGooglePasswordSetupStatus
                    )
                    BackHandler { returnToSettings(navController) }
                }

                composable(Screen.DeleteAccount.route) {
                    val deletionUser = (authState as? AuthState.Authenticated)?.user
                    DeleteAccountScreen(
                        onBackClick = { navController.popBackStack() },
                        hasPassword = deletionUser?.hasPassword == true,
                        hasGoogleLogin = deletionUser?.hasGoogleLogin == true,
                        onSubmitDelete = { password -> authViewModel.deleteAccount(password) },
                        isDeleting = isDeletingAccount,
                        onCreatePassword = {
                            authViewModel.resetPasswordSetupState()
                            navController.navigate(Screen.CreatePassword.route) {
                                popUpTo(Screen.DeleteAccount.route) { inclusive = true }
                                launchSingleTop = true
                            }
                        }
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
                    val returnFromVerification = {
                        if (authState is AuthState.Authenticated) returnToSettings(navController)
                        else navController.navigate(Screen.Login.route) {
                            popUpTo(navController.graph.id) { inclusive = false }
                            launchSingleTop = true
                        }
                    }
                    BackHandler { returnFromVerification() }
                    Column(
                        modifier = androidx.compose.ui.Modifier.fillMaxSize().padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(
                            text = when (passwordSetupState) {
                                PasswordSetupState.Verifying -> "Verifying your email and setting your password…"
                                PasswordSetupState.Verified -> "Your password has been created. You can now sign in using your email and password."
                                is PasswordSetupState.Error -> (passwordSetupState as PasswordSetupState.Error).message
                                else -> "Open madds to finish verifying your password."
                            },
                            style = MaterialTheme.typography.bodyLarge
                        )
                        Spacer(modifier = androidx.compose.ui.Modifier.height(20.dp))
                        Button(onClick = { returnFromVerification() }, enabled = passwordSetupState !is PasswordSetupState.Verifying) {
                            Text(if (authState is AuthState.Authenticated) "Back to Settings" else "Sign in")
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
                        onTryStyleClick = { id -> navController.navigate(Screen.SelectPhotos.createRoute(id)) { launchSingleTop = true } }
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
                          if (navController.currentBackStackEntry?.id == backStackEntry.id) {
                            generationViewModel.setSelectedPhotos(uris)
                            generationViewModel.generateImage(styleId)
                            navController.navigate(Screen.Generation.createRoute(styleId)) { launchSingleTop = true }
                            val generationEntry = navController.currentBackStackEntry
                            // Generation is already running; ad availability never gates submission.
                            scope.launch {
                                val activity = context as? Activity ?: return@launch
                                AdManager.loadInterstitial(activity)
                                withTimeoutOrNull(2_500) {
                                    while (!AdManager.isInterstitialReady() &&
                                        navController.currentBackStackEntry?.id == generationEntry?.id) delay(100)
                                }
                                if (generationEntry != null && navController.currentBackStackEntry?.id == generationEntry.id &&
                                    lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED) &&
                                    !activity.isFinishing && !activity.isDestroyed &&
                                    AdManager.isInterstitialReady() &&
                                    (generationViewModel.uiState.value is GenerationUiState.Uploading ||
                                        generationViewModel.uiState.value is GenerationUiState.Processing)) {
                                    AdManager.showInterstitial(activity) { }
                                }
                            }
                          }
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


                    BackHandler {
                        if (genState is GenerationUiState.Error && !(genState as GenerationUiState.Error).isAmbiguous) generationViewModel.markFocusedViewed()
                        generationViewModel.resetState()
                        navController.popBackStack()
                    }
                    GenerationScreen(
                        state = genState,
                        statusMessage = statusMsg,
                        selectedPhotos = selectedPhotos,
                        onCancelClick = {
                            if (genState is GenerationUiState.Error && !(genState as GenerationUiState.Error).isAmbiguous) generationViewModel.markFocusedViewed()
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
                          if (navController.currentBackStackEntry?.destination?.route == Screen.Generation.route) {
                            navController.navigate(Screen.Result.route) {
                                popUpTo(Screen.Generation.route) { inclusive = true }
                            }
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
                        onSaveClick = {
                            if (generationViewModel.saveImageToGallery(context)) {
                                Toast.makeText(context, "Your image is being saved to gallery", Toast.LENGTH_SHORT).show()
                            }
                        },
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
                        onSubmitClick = { t, p -> authViewModel.resetPassword(t, p) },
                        onBackClick = {
                            if (authState is AuthState.Authenticated) returnToSettings(navController)
                            else navController.navigate(Screen.Login.route) {
                                popUpTo(navController.graph.id) { inclusive = false }
                                launchSingleTop = true
                            }
                        },
                        onSuccess = {
                            Toast.makeText(context, "Password reset successfully. Please sign in.", Toast.LENGTH_LONG).show()
                            navController.navigate(Screen.Login.route) {
                                popUpTo(navController.graph.id) { inclusive = false }
                                launchSingleTop = true
                            }
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
                        val now = SystemClock.elapsedRealtime()
                        val showMainAd = route != currentRoute && generationOwner != null &&
                            mainAdTimer.isDue(now) && AdManager.mainScreenInterstitialAllowed(now) &&
                            AdManager.isInterstitialReady() &&
                            lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
                        navController.navigate(route) {
                            popUpTo(Screen.Home.route) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                        val activity = context as? Activity
                        if (showMainAd && activity != null && !activity.isFinishing && !activity.isDestroyed) {
                            mainAdTimer.reset(now)
                            AdManager.showInterstitial(activity) { }
                        }
                    }
                )
            }
        }

        // Shared Banner Slot: Takes physical space ONLY when visible.
        if (!isBottomBarVisible) BannerAdView(modifier = Modifier.fillMaxWidth())
    }
    }
}

private fun returnToSettings(navController: NavHostController) {
    if (!navController.popBackStack(Screen.Settings.route, false)) {
        navController.navigate(Screen.Home.route) {
            popUpTo(navController.graph.id) { inclusive = false }
            launchSingleTop = true
        }
        navController.navigate(Screen.Settings.route) { launchSingleTop = true }
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
