package com.itsdhruvbhardwaj.picme

import android.content.Intent
import android.os.Bundle
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
import com.itsdhruvbhardwaj.picme.ui.screens.home.HomeViewModel
import com.itsdhruvbhardwaj.picme.ui.screens.search.ExploreViewModel
import com.itsdhruvbhardwaj.picme.ui.theme.PicMeTheme
import com.itsdhruvbhardwaj.picme.utils.AdManager
import com.itsdhruvbhardwaj.picme.utils.BillingManager
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class MainActivity : ComponentActivity() {
    
    private var intentState by mutableStateOf<Intent?>(null)
    private lateinit var billingManager: BillingManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

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
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
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
        val generationViewModel = ViewModelProvider(this, viewModelFactory)[GenerationViewModel::class.java]
        val favoritesViewModel = ViewModelProvider(this, viewModelFactory)[FavoritesViewModel::class.java]
        val exploreViewModel = ViewModelProvider(this, viewModelFactory)[ExploreViewModel::class.java]

        setContent {
            PicMeTheme {
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
        // Process any purchases that might have completed while the app was in background
        val authViewModel = ViewModelProvider(this)[AuthViewModel::class.java]
        authViewModel.processPendingPurchases()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intentState = intent
    }
}
