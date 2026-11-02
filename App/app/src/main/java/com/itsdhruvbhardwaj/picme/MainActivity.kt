package com.itsdhruvbhardwaj.picme

import android.content.Intent
import android.Manifest
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.launch
import androidx.navigation.compose.rememberNavController
import com.google.android.gms.ads.MobileAds
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.local.HomeFeedCache
import com.itsdhruvbhardwaj.picme.data.remote.AuthApiService
import com.itsdhruvbhardwaj.picme.data.remote.ApiClients
import com.itsdhruvbhardwaj.picme.data.remote.StyleApiService
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import com.itsdhruvbhardwaj.picme.data.repository.GenerationRepository
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import com.itsdhruvbhardwaj.picme.navigation.NavGraph
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.screens.create.GenerationViewModel
import com.itsdhruvbhardwaj.picme.ui.screens.home.FavoritesViewModel
import com.itsdhruvbhardwaj.picme.ui.screens.home.CollectionsViewModel
import com.itsdhruvbhardwaj.picme.ui.screens.home.HomeViewModel
import com.itsdhruvbhardwaj.picme.ui.screens.search.ExploreViewModel
import com.itsdhruvbhardwaj.picme.ui.theme.MaddsTheme
import com.itsdhruvbhardwaj.picme.utils.AdManager
import com.itsdhruvbhardwaj.picme.utils.BillingManager
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class MainActivity : ComponentActivity() {
    private var pendingNotificationId by mutableStateOf<String?>(null)
    private var pendingGeneration by mutableStateOf<String?>(null)

    private var intentState by mutableStateOf<Intent?>(null)
    private lateinit var billingManager: BillingManager
    private lateinit var appUpdateManager: AppUpdateManager
    private var updatePromptStartedThisSession = false
    private var updateReadyDialogShown = false
    private var notificationPermissionFlowStarted = false
    private val notificationPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        com.itsdhruvbhardwaj.picme.notifications.PushSyncWorker.enqueue(applicationContext)
    }

    private val updateFlowLauncher = registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult()
    ) { result ->
        if (result.resultCode != RESULT_OK) {
            Log.i(TAG, "User deferred or canceled the in-app update flow")
        }
    }

    private val updateStateListener = InstallStateUpdatedListener { state ->
        if (state.installStatus() == InstallStatus.DOWNLOADED) {
            showUpdateReadyDialog()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Android 15+ enforces edge-to-edge. Legacy transparent bars are set
        // by versioned themes, avoiding deprecated Window color setters here.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        com.itsdhruvbhardwaj.picme.notifications.PushNotifications.createChannels(this)
        com.itsdhruvbhardwaj.picme.notifications.GenerationNotifications.createChannels(this)
        pendingGeneration = savedInstanceState?.getString("pending_generation")
            ?: com.itsdhruvbhardwaj.picme.notifications.GenerationNotifications.tap(intent)
        pendingNotificationId = savedInstanceState?.getString("pending_push_id")
            ?: com.itsdhruvbhardwaj.picme.notifications.PushNotifications.tapId(intent)

        appUpdateManager = AppUpdateManagerFactory.create(this)
        appUpdateManager.registerListener(updateStateListener)

        // Initialize Google Mobile Ads SDK
        MobileAds.initialize(this) {
            AdManager.loadInterstitial(this)
            AdManager.loadRewardedAd(this)
        }

        // Initialize Billing Manager
        billingManager = BillingManager(applicationContext)

        val tokenStorage = AuthTokenStorage(applicationContext)
        lateinit var authRepository: AuthRepository

        val clients = ApiClients(tokenStorage) { authRepository }

        val retrofit = Retrofit.Builder()
            .baseUrl("https://picme-ai.onrender.com/")
            .client(clients.content)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        val authApiService = retrofit.create(AuthApiService::class.java)
        val styleApiService = retrofit.create(StyleApiService::class.java)
        val refreshApiService = retrofit.newBuilder().client(clients.refresh).build()
            .create(AuthApiService::class.java)
        // Image generation keeps its longer timeout and a separate request queue.
        val generationApiService = retrofit.newBuilder().client(clients.generation)
            .build().create(StyleApiService::class.java)

        authRepository = AuthRepository(authApiService, tokenStorage, refreshApiService)
        val notificationPreferences = com.itsdhruvbhardwaj.picme.notifications.PushPreferencesRepository(applicationContext, retrofit, tokenStorage, authRepository)
        val styleRepository = StyleRepository(styleApiService, tokenStorage, HomeFeedCache(applicationContext))
        val generationRepository = GenerationRepository(generationApiService, applicationContext.contentResolver, tokenStorage)

        val viewModelFactory = object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return when {
                    modelClass.isAssignableFrom(com.itsdhruvbhardwaj.picme.notifications.NotificationPreferencesViewModel::class.java) ->
                        com.itsdhruvbhardwaj.picme.notifications.NotificationPreferencesViewModel(notificationPreferences) as T
                    modelClass.isAssignableFrom(AuthViewModel::class.java) ->
                        AuthViewModel(authRepository, billingManager) as T
                    modelClass.isAssignableFrom(HomeViewModel::class.java) ->
                        HomeViewModel(styleRepository) as T
                    modelClass.isAssignableFrom(CollectionsViewModel::class.java) ->
                        CollectionsViewModel(styleRepository) as T
                    modelClass.isAssignableFrom(GenerationViewModel::class.java) ->
                        GenerationViewModel(generationRepository) as T
                    modelClass.isAssignableFrom(FavoritesViewModel::class.java) ->
                        FavoritesViewModel(styleRepository) as T
                    modelClass.isAssignableFrom(ExploreViewModel::class.java) ->
                        ExploreViewModel(styleRepository) as T
                    else -> throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
                }
            }
        }

        val authViewModel = ViewModelProvider(this, viewModelFactory)[AuthViewModel::class.java]
        val pushSync = com.itsdhruvbhardwaj.picme.notifications.PushDeviceSync(applicationContext, retrofit, tokenStorage, authRepository, notificationPreferences)
        val notificationViewModel = ViewModelProvider(this, viewModelFactory)[com.itsdhruvbhardwaj.picme.notifications.NotificationPreferencesViewModel::class.java]
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                pushSync.observe(authViewModel.authState)
            }
        }
        val homeViewModel = ViewModelProvider(this, viewModelFactory)[HomeViewModel::class.java]
        val collectionsViewModel = ViewModelProvider(this, viewModelFactory)[CollectionsViewModel::class.java]
        val generationViewModel = ViewModelProvider(this, viewModelFactory)[GenerationViewModel::class.java]
        generationViewModel.onDownloadStateChanged = { owner, id, stage ->
            com.itsdhruvbhardwaj.picme.notifications.GenerationNotifications.download(applicationContext, owner, id, stage)
        }
        lifecycleScope.launch {
            generationViewModel.operations.collect { items ->
                com.itsdhruvbhardwaj.picme.notifications.GenerationNotifications.sync(applicationContext, generationViewModel.notificationOwner(), items)
            }
        }
        val favoritesViewModel = ViewModelProvider(this, viewModelFactory)[FavoritesViewModel::class.java]
        val exploreViewModel = ViewModelProvider(this, viewModelFactory)[ExploreViewModel::class.java]

        setContent {
            MaddsTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    val navController = rememberNavController()

                    LaunchedEffect(intentState) {
                        intentState?.let {
                            navController.handleDeepLink(it)
                            intentState = null
                        }
                    }

                    NavGraph(
                        navController = navController,
                        authViewModel = authViewModel,
                        homeViewModel = homeViewModel,
                        collectionsViewModel = collectionsViewModel,
                        generationViewModel = generationViewModel,
                        favoritesViewModel = favoritesViewModel,
                        exploreViewModel = exploreViewModel,
                        styleRepository = styleRepository,
                        notificationPreferencesViewModel = notificationViewModel,
                        pendingNotificationId = pendingNotificationId,
                        onNotificationHandled = { pendingNotificationId = null },
                        pendingGeneration = pendingGeneration,
                        onGenerationNotificationHandled = { pendingGeneration = null }
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        com.itsdhruvbhardwaj.picme.notifications.PushRegistration.refresh()
        checkForAppUpdate()
        // Process any purchases that might have completed while the app was in background
        val authViewModel = ViewModelProvider(this)[AuthViewModel::class.java]
        authViewModel.processPendingPurchases()
    }

    override fun onPostResume() {
        super.onPostResume()
        if (notificationPermissionFlowStarted) return
        notificationPermissionFlowStarted = true
        val permissionPrefs = getSharedPreferences("madds_push_installation", MODE_PRIVATE)
        if (Build.VERSION.SDK_INT >= 33 &&
            !com.itsdhruvbhardwaj.picme.notifications.PushNotifications.permissionGranted(this) &&
            !permissionPrefs.getBoolean("permission_requested", false)) {
            permissionPrefs.edit().putBoolean("permission_requested", true).apply()
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onDestroy() {
        if (::appUpdateManager.isInitialized) {
            appUpdateManager.unregisterListener(updateStateListener)
        }
        super.onDestroy()
    }

    private fun checkForAppUpdate() {
        if (updatePromptStartedThisSession) return

        appUpdateManager.appUpdateInfo
            .addOnSuccessListener { updateInfo ->
                if (updateInfo.installStatus() == InstallStatus.DOWNLOADED) {
                    showUpdateReadyDialog()
                } else if (
                    updateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE &&
                    updateInfo.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)
                ) {
                    startFlexibleUpdate(updateInfo)
                }
            }
            .addOnFailureListener { error ->
                Log.w(TAG, "Could not check Google Play for an app update", error)
            }
    }

    private fun startFlexibleUpdate(updateInfo: AppUpdateInfo) {
        if (updatePromptStartedThisSession) return
        updatePromptStartedThisSession = true
        try {
            appUpdateManager.startUpdateFlowForResult(
                updateInfo,
                updateFlowLauncher,
                AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build()
            )
        } catch (error: Exception) {
            updatePromptStartedThisSession = false
            Log.e(TAG, "Could not start the Google Play in-app update", error)
        }
    }

    private fun showUpdateReadyDialog() {
        if (updateReadyDialogShown || isFinishing || isDestroyed) return
        updateReadyDialogShown = true

        android.app.AlertDialog.Builder(this)
            .setTitle("Update ready")
            .setMessage("madds has downloaded the latest update. Restart the app to install it.")
            .setPositiveButton("Restart now") { _, _ ->
                appUpdateManager.completeUpdate()
            }
            .setNegativeButton("Later", null)
            .setOnDismissListener { updateReadyDialogShown = false }
            .show()
    }

    companion object {
        private const val TAG = "PicMeAppUpdate"
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.action == com.itsdhruvbhardwaj.picme.notifications.PushNotifications.OPEN_ACTION) {
            pendingNotificationId = com.itsdhruvbhardwaj.picme.notifications.PushNotifications.tapId(intent)
        } else if (intent.action == com.itsdhruvbhardwaj.picme.notifications.GenerationNotifications.OPEN_ACTION) {
            pendingGeneration = com.itsdhruvbhardwaj.picme.notifications.GenerationNotifications.tap(intent)
        } else intentState = intent
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("pending_push_id", pendingNotificationId)
        outState.putString("pending_generation", pendingGeneration)
        super.onSaveInstanceState(outState)
    }
}
