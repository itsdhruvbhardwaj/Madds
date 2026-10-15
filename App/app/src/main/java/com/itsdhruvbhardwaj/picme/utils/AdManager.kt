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
    private var isRewardedLoading = false

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
        if (mRewardedAd != null || isRewardedLoading) return

        isRewardedLoading = true
        val adRequest = AdRequest.Builder().build()
        RewardedAd.load(
            context,
            BuildConfig.AD_UNIT_ID_REWARDED,
            adRequest,
            object : RewardedAdLoadCallback() {
                override fun onAdFailedToLoad(adError: LoadAdError) {
                    Log.d(TAG, "Rewarded ad failed to load: ${adError.message}")
                    mRewardedAd = null
                    isRewardedLoading = false
                }

                override fun onAdLoaded(rewardedAd: RewardedAd) {
                    Log.d(TAG, "Rewarded ad was loaded.")
                    mRewardedAd = rewardedAd
                    isRewardedLoading = false
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
                    loadRewardedAd(activity)
                    onAdDismissed()
                }

                override fun onAdFailedToShowFullScreenContent(adError: com.google.android.gms.ads.AdError) {
                    Log.d(TAG, "Rewarded ad failed to show.")
                    mRewardedAd = null
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
