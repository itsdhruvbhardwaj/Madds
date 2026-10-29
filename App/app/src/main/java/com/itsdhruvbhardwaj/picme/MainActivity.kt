package com.itsdhruvbhardwaj.picme

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
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
import com.itsdhruvbhardwaj.picme.data.remote.AuthApiService
import com.itsdhruvbhardwaj.picme.data.remote.AuthAuthenticator
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
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class MainActivity : ComponentActivity() {

    private var intentState by mutableStateOf<Intent?>(null)
    private lateinit var billingManager: BillingManager
    private lateinit var appUpdateManager: AppUpdateManager
    private var updatePromptStartedThisSession = false
    private var updateReadyDialogShown = false

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
        enableEdgeToEdge()

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

        val okHttpClient = OkHttpClient.Builder()
            .authenticator(AuthAuthenticator(tokenStorage) { authRepository })
            .connectTimeout(30, TimeUnit.SECONDS)
            // Image generation can take longer than a normal API request.
            // Keep the client connected long enough for the backend's provider timeout.
            .readTimeout(180, TimeUnit.SECONDS)
            .writeTimeout(120, TimeUnit.SECONDS)
            .callTimeout(180, TimeUnit.SECONDS)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl("https://picme-ai.onrender.com/")
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        val authApiService = retrofit.create(AuthApiService::class.java)
        val styleApiService = retrofit.create(StyleApiService::class.java)

        authRepository = AuthRepository(authApiService, tokenStorage)
        val styleRepository = StyleRepository(styleApiService, tokenStorage)
        val generationRepository = GenerationRepository(styleApiService, applicationContext.contentResolver, tokenStorage)

        val viewModelFactory = object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return when {
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
        val homeViewModel = ViewModelProvider(this, viewModelFactory)[HomeViewModel::class.java]
        val collectionsViewModel = ViewModelProvider(this, viewModelFactory)[CollectionsViewModel::class.java]
        val generationViewModel = ViewModelProvider(this, viewModelFactory)[GenerationViewModel::class.java]
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
                        styleRepository = styleRepository
                    )
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        checkForAppUpdate()
        // Process any purchases that might have completed while the app was in background
        val authViewModel = ViewModelProvider(this)[AuthViewModel::class.java]
        authViewModel.processPendingPurchases()
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
        intentState = intent
    }
}
