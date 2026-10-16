package com.itsdhruvbhardwaj.picme.utils

import android.app.Activity
import android.content.Context
import android.util.Log
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.OnUserEarnedRewardListener
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.gms.ads.rewarded.ServerSideVerificationOptions
import com.itsdhruvbhardwaj.picme.BuildConfig
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * States for rewarded ad loading.
 */
sealed interface RewardedAdLoadState {
    data object Idle : RewardedAdLoadState
    data object Loading : RewardedAdLoadState
    data object Ready : RewardedAdLoadState
    data class Error(val message: String, val code: Int) : RewardedAdLoadState
}

/**
 * Singleton manager to handle preloading and showing interstitial and rewarded ads.
 */
object AdManager {
    private const val TAG = "AdManager"
    
    // Interstitial Ad
    private var mInterstitialAd: InterstitialAd? = null
    private var isInterstitialLoading = false

    // Rewarded Ad
    private var mRewardedAd: RewardedAd? = null
    private val _rewardedAdState = MutableStateFlow<RewardedAdLoadState>(RewardedAdLoadState.Idle)
    val rewardedAdState: StateFlow<RewardedAdLoadState> = _rewardedAdState.asStateFlow()

    /**
     * Preloads an interstitial ad.
     */
    fun loadInterstitial(context: Context) {
        if (mInterstitialAd != null || isInterstitialLoading) return

        isInterstitialLoading = true
        val adRequest = AdRequest.Builder().build()
        InterstitialAd.load(
            context,
            BuildConfig.AD_UNIT_ID_INTERSTITIAL,
            adRequest,
            object : InterstitialAdLoadCallback() {
                override fun onAdFailedToLoad(adError: LoadAdError) {
                    Log.d(TAG, "Interstitial failed to load: ${adError.message}")
                    mInterstitialAd = null
                    isInterstitialLoading = false
                }

                override fun onAdLoaded(interstitialAd: InterstitialAd) {
                    Log.d(TAG, "Interstitial ad was loaded.")
                    mInterstitialAd = interstitialAd
                    isInterstitialLoading = false
                }
            }
        )
    }

    /**
     * Shows the preloaded interstitial ad if available.
     */
    fun showInterstitial(activity: Activity, onAdDismissed: () -> Unit) {
        if (mInterstitialAd != null) {
            mInterstitialAd?.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() {
                    Log.d(TAG, "Interstitial ad was dismissed.")
                    mInterstitialAd = null
                    loadInterstitial(activity)
                    onAdDismissed()
                }

                override fun onAdFailedToShowFullScreenContent(adError: com.google.android.gms.ads.AdError) {
                    Log.d(TAG, "Interstitial ad failed to show.")
                    mInterstitialAd = null
                    onAdDismissed()
                }
            }
            mInterstitialAd?.show(activity)
        } else {
            Log.d(TAG, "The interstitial ad wasn't ready yet.")
            onAdDismissed()
        }
    }

    fun isInterstitialReady(): Boolean = mInterstitialAd != null

    /**
     * Preloads a rewarded ad.
     */
    fun loadRewardedAd(context: Context) {
        if (mRewardedAd != null || _rewardedAdState.value is RewardedAdLoadState.Loading) return

        _rewardedAdState.value = RewardedAdLoadState.Loading
        val adRequest = AdRequest.Builder().build()
        RewardedAd.load(
            context,
            BuildConfig.AD_UNIT_ID_REWARDED,
            adRequest,
            object : RewardedAdLoadCallback() {
                override fun onAdFailedToLoad(adError: LoadAdError) {
                    // Log the full diagnostic information
                    Log.e(TAG, "Rewarded ad failed to load: $adError")
                    mRewardedAd = null
                    _rewardedAdState.value = RewardedAdLoadState.Error(adError.message, adError.code)
                }

                override fun onAdLoaded(rewardedAd: RewardedAd) {
                    Log.d(TAG, "Rewarded ad was loaded.")
                    mRewardedAd = rewardedAd
                    _rewardedAdState.value = RewardedAdLoadState.Ready
                }
            }
        )
    }

    /**
     * Shows the preloaded rewarded ad with SSV custom data.
     */
    fun showRewardedAd(
        activity: Activity,
        customData: String,
        onRewardEarned: () -> Unit,
        onAdDismissed: () -> Unit
    ) {
        if (mRewardedAd != null) {
            val options = ServerSideVerificationOptions.Builder()
                .setCustomData(customData)
                .build()
            mRewardedAd?.setServerSideVerificationOptions(options)

            mRewardedAd?.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() {
                    Log.d(TAG, "Rewarded ad was dismissed.")
                    mRewardedAd = null
                    _rewardedAdState.value = RewardedAdLoadState.Idle
                    loadRewardedAd(activity)
                    onAdDismissed()
                }

                override fun onAdFailedToShowFullScreenContent(adError: com.google.android.gms.ads.AdError) {
                    Log.e(TAG, "Rewarded ad failed to show: $adError")
                    mRewardedAd = null
                    _rewardedAdState.value = RewardedAdLoadState.Error(adError.message, adError.code)
                    onAdDismissed()
                }
            }

            mRewardedAd?.show(activity, OnUserEarnedRewardListener { rewardItem ->
                Log.d(TAG, "User earned reward: ${rewardItem.amount} ${rewardItem.type}")
                onRewardEarned()
            })
        } else {
            Log.d(TAG, "The rewarded ad wasn't ready yet.")
            onAdDismissed()
        }
    }

    fun isRewardedAdReady(): Boolean = mRewardedAd != null
}
