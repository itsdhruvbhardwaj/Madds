package com.itsdhruvbhardwaj.picme.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.LoadAdError
import com.itsdhruvbhardwaj.picme.BuildConfig

@Composable
fun BannerAdView(
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val configuration = LocalConfiguration.current
    val screenWidth = configuration.screenWidthDp
    
    // State to track if the ad is successfully loaded
    var isAdLoaded by remember { mutableStateOf(false) }
    // State to track if loading failed
    var isAdFailed by remember { mutableStateOf(false) }

    // If ad failed to load, we don't show anything (release space)
    if (isAdFailed) return

    // Wrapping in a Box to control visibility/space based on load status
    Box(
        modifier = modifier
            .fillMaxWidth()
            .then(if (isAdLoaded) Modifier else Modifier.height(0.dp))
    ) {
        AndroidView(
            modifier = Modifier.fillMaxWidth(),
            factory = { ctx ->
                AdView(ctx).apply {
                    adUnitId = BuildConfig.AD_UNIT_ID_BANNER
                    setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(ctx, screenWidth))
                    adListener = object : AdListener() {
                        override fun onAdLoaded() {
                            isAdLoaded = true
                            isAdFailed = false
                        }

                        override fun onAdFailedToLoad(error: LoadAdError) {
                            isAdLoaded = false
                            isAdFailed = true
                        }
                    }
                    loadAd(AdRequest.Builder().build())
                }
            },
            update = { adView ->
                // No specific update logic needed for static banner
            },
            onRelease = { adView ->
                adView.destroy()
            }
        )
    }
}
