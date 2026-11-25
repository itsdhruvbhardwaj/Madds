package com.itsdhruvbhardwaj.picme.ui.components

import android.util.Log
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.LoadAdError
import com.itsdhruvbhardwaj.picme.BuildConfig
import com.itsdhruvbhardwaj.picme.utils.AdPolicy
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay
import java.util.concurrent.atomic.AtomicBoolean

private const val BANNER_TAG = "MaddsBanner"

@Composable
fun BannerAdView(modifier: Modifier = Modifier) {
    val adConfig by AdPolicy.config.collectAsState()
    if (!adConfig.enabled || !adConfig.bannersEnabled) return

    BoxWithConstraints(modifier = modifier.fillMaxWidth()) {
        // Use the actual banner slot, including tablet and split-screen constraints.
        val widthDp = maxWidth.value.toInt().coerceAtLeast(1)
        key(widthDp) { BannerAdSlot(widthDp) }
    }
}

@Composable
private fun BannerAdSlot(widthDp: Int) {
    val lifecycleOwner = LocalLifecycleOwner.current
    var loaded by remember { mutableStateOf(false) }
    var loadError by remember { mutableStateOf<LoadAdError?>(null) }
    var retryAttempt by remember { mutableIntStateOf(0) }

    LaunchedEffect(loadError, retryAttempt, lifecycleOwner) {
        val error = loadError ?: return@LaunchedEffect
        // Retry a temporary failure twice; invalid IDs/configuration need correction.
        if (error.code == AdRequest.ERROR_CODE_INVALID_REQUEST || retryAttempt >= 2) return@LaunchedEffect
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            delay(30_000L * (retryAttempt + 1))
            Log.i(BANNER_TAG, "RETRY attempt=${retryAttempt + 1}")
            retryAttempt++
            loadError = null
            awaitCancellation()
        }
    }

    if (loadError != null) return
    key(retryAttempt) {
        val active = remember { AtomicBoolean(true) }
        Box(Modifier.fillMaxWidth().then(if (loaded) Modifier else Modifier.height(0.dp))) {
            AndroidView(
                modifier = Modifier.fillMaxWidth(),
                factory = { context ->
                    AdView(context).apply {
                        adUnitId = BuildConfig.AD_UNIT_ID_BANNER
                        setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(context, widthDp))
                        adListener = object : AdListener() {
                            override fun onAdLoaded() {
                                if (!active.get()) return
                                loaded = true
                                loadError = null
                                Log.i(BANNER_TAG, "LOADED response=${responseInfo?.responseId ?: "none"}")
                            }

                            override fun onAdFailedToLoad(error: LoadAdError) {
                                if (!active.get()) return
                                loaded = false
                                loadError = error
                                // ResponseInfo.toString() can expose adapter credentials; log only safe fields.
                                val message = error.message.replace(Regex("[\\r\\n]+"), " ").take(250)
                                Log.w(BANNER_TAG, "LOAD_FAILED code=${error.code} domain=${error.domain} message=$message response=${error.responseInfo?.responseId ?: "none"}")
                            }
                        }
                        Log.i(BANNER_TAG, "LOAD_STARTED attempt=${retryAttempt + 1} widthDp=$widthDp unit=$adUnitId")
                        loadAd(AdRequest.Builder().build())
                    }
                },
                onRelease = { adView ->
                    active.set(false)
                    adView.destroy()
                }
            )
        }
    }
}
