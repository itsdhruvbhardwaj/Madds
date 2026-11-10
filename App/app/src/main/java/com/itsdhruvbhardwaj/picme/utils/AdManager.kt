package com.itsdhruvbhardwaj.picme.utils

import android.app.Activity
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.google.android.gms.ads.ResponseInfo
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collectLatest
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
    
    private const val INTERSTITIAL_TAG = "MaddsInterstitial"
    private var mInterstitialAd: InterstitialAd? = null
    private val loadState = InterstitialReadiness()
    private var isInterstitialShowing = false
    private var isRewardedShowing = false
    private var sdkReady = false
    private var foreground = false
    private var diagnosticOverlayVisible = false
    private var appContext: Context? = null
    private val main by lazy { Handler(Looper.getMainLooper()) }
    private val appScope by lazy { CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate) }
    private var policyJob: Job? = null
    private var retryTask: Runnable? = null
    private var watchdog: Runnable? = null
    private var lastNetwork: Boolean? = null
    private var lastEventKey = ""
    private var lastEventAt = -30_000L
    private val _interstitialDiagnostics = MutableStateFlow(InterstitialDiagnostics())
    val interstitialDiagnostics = _interstitialDiagnostics.asStateFlow()
    fun isDiagnosticOverlayVisible(): Boolean = diagnosticOverlayVisible
    fun setDiagnosticOverlayVisible(visible:Boolean) = onMain { diagnosticOverlayVisible=visible }
    fun isFullScreenAdShowing(): Boolean = isInterstitialShowing || isRewardedShowing
    private fun onMain(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) action() else main.post { action() }
    }
    private fun configured() = AdPolicy.config.value.let { it.enabled && it.placements.values.any { value -> value } }
    private fun online(): Boolean = try {
        val cm = appContext?.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val caps = cm?.getNetworkCapabilities(cm.activeNetwork)
        cm == null || (caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED))
    } catch (_: RuntimeException) { true }
    private fun publish() {
        val now = SystemClock.elapsedRealtime()
        val readiness = when {
            !configured() -> "Disabled by Workspace"
            !sdkReady -> "Waiting for SDK initialization"
            mInterstitialAd != null && loadState.ready(now) -> "Ready"
            loadState.activeRequest != null -> "Loading"
            !online() -> "Offline"
            !foreground -> "App in background"
            now < loadState.retryAt -> "Waiting to retry"
            else -> "Not loaded"
        }
        _interstitialDiagnostics.value = _interstitialDiagnostics.value.copy(readiness=readiness,
            retryAtUptime=loadState.retryAt,cachedAtUptime=loadState.loadedAt)
    }
    private fun note(event: String, detail: String = "") {
        val now = SystemClock.elapsedRealtime()
        val clean = detail.replace(Regex("[\\r\\n]+")," ").take(500)
        val key = "$event:$clean"
        if (key == lastEventKey && now-lastEventAt < 30_000) return
        lastEventKey=key;lastEventAt=now
        Log.i(INTERSTITIAL_TAG,"$event $clean")
        _interstitialDiagnostics.value = _interstitialDiagnostics.value.copy(events=
            (_interstitialDiagnostics.value.events+InterstitialDiagnosticEvent(System.currentTimeMillis(),event,clean)).takeLast(40))
        publish()
    }
    private fun responseDetails(info: ResponseInfo?): String {
        if (info == null) return "response=none"
        // Do not log ResponseInfo.toString(): it can contain adapter credentials.
        val adapters=info.adapterResponses.take(3).joinToString { "${it.adapterClassName}:${it.latencyMillis}ms/code=${it.adError?.code ?: "ok"}" }
        return "response=${info.responseId ?: "none"} adapter=${info.mediationAdapterClassName ?: "none"} sources=[$adapters]"
    }
    fun onSdkInitialized(context: Context) = onMain {
        appContext=context.applicationContext;sdkReady=true
        if (policyJob == null) {
            val cm=appContext?.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val callback=object:ConnectivityManager.NetworkCallback(){
                private fun changed()=onMain {
                    val connected=online()
                    if(lastNetwork!=connected){
                        val restored=lastNetwork==false && connected;lastNetwork=connected
                        note(if(connected)"NETWORK_AVAILABLE" else "NETWORK_LOST")
                        if(restored)loadState.connectivityRestored(SystemClock.elapsedRealtime())
                        if(connected && foreground)loadMain("network_recovery") else publish()
                    }
                }
                override fun onAvailable(network:Network){changed()}
                override fun onLost(network:Network){changed()}
                override fun onCapabilitiesChanged(network:Network,capabilities:NetworkCapabilities){changed()}
            }
            runCatching { cm?.registerDefaultNetworkCallback(callback) }
            lastNetwork=online()
            policyJob=appScope.launch {
                AdPolicy.config.collectLatest {
                    if(!configured()) {
                        cancelRetry();cancelWatchdog();loadState.clear();mInterstitialAd=null
                        note("DISABLED","All interstitial placements are disabled")
                    } else if(foreground)loadMain("settings_refresh")
                    publish()
                }
            }
        }
        note("SDK_READY","unit=${BuildConfig.AD_UNIT_ID_INTERSTITIAL}")
        loadMain("sdk_ready")
    }
    fun setForeground(context: Context, active: Boolean) = onMain {
        appContext=context.applicationContext;foreground=active
        if(active)loadMain("foreground") else {cancelRetry();publish()}
    }
    private fun cancelRetry(){retryTask?.let{main.removeCallbacks(it)};retryTask=null}
    private fun cancelWatchdog(){watchdog?.let{main.removeCallbacks(it)};watchdog=null}
    private fun scheduleRetry() {
        cancelRetry()
        if(!foreground || !sdkReady || !configured() || !online() || loadState.activeRequest!=null || mInterstitialAd!=null)return
        val wait=(loadState.retryAt-SystemClock.elapsedRealtime()).coerceAtLeast(1_000)
        val task=Runnable {retryTask=null;loadMain("scheduled_retry")}
        retryTask=task;main.postDelayed(task,wait)
    }
    private fun expireCached(): Boolean {
        if(!loadState.expire(SystemClock.elapsedRealtime()))return false
        mInterstitialAd=null;note("CACHE_EXPIRED","Discarded cached ad before Google's one-hour expiry")
        return true
    }
    /** SDK loading is serialized on main; callers never wait for an ad to finish loading. */
    fun loadInterstitial(context: Context) = onMain {
        appContext=context.applicationContext;loadMain("preload")
    }
    private fun loadMain(reason: String, duringAd: Boolean = false) {
        expireCached()
        if(!configured() || !sdkReady || (!foreground && !(duringAd && isInterstitialShowing)) || !online()) {publish();return}
        val now=SystemClock.elapsedRealtime()
        val ticket=loadState.begin(now)
        if(ticket==null){publish();if(loadState.activeRequest==null && mInterstitialAd==null)scheduleRetry();return}
        cancelRetry()
        note("LOAD_STARTED","request=$ticket reason=$reason")
        val timeout=Runnable {
            if(loadState.activeRequest==ticket && loadState.timeout(SystemClock.elapsedRealtime())) {
                watchdog=null
                _interstitialDiagnostics.value=_interstitialDiagnostics.value.copy(lastFailure="LOAD_TIMEOUT: no SDK callback within 60 seconds")
                note("LOAD_TIMEOUT","request=$ticket");scheduleRetry()
            }
        }
        watchdog=timeout;main.postDelayed(timeout,InterstitialReadiness.LOAD_TIMEOUT_MS)
        fun failure(code:Int,domain:String,message:String,info:ResponseInfo?) {
            val kind=when(code){2->InterstitialFailure.NETWORK;3->InterstitialFailure.NO_FILL;1->InterstitialFailure.INVALID_REQUEST;else->InterstitialFailure.INTERNAL}
            if(!loadState.failed(ticket,SystemClock.elapsedRealtime(),kind)){note("STALE_FAILURE_IGNORED","request=$ticket");return}
            cancelWatchdog();mInterstitialAd=null
            _interstitialDiagnostics.value=_interstitialDiagnostics.value.copy(lastFailure="$kind code=$code domain=$domain ${message.take(250)}")
            note("LOAD_FAILED","request=$ticket kind=$kind code=$code domain=$domain elapsedMs=${SystemClock.elapsedRealtime()-now} ${message.take(200)} ${responseDetails(info)}")
            scheduleRetry()
        }
        try {
            InterstitialAd.load(appContext!!,BuildConfig.AD_UNIT_ID_INTERSTITIAL,AdRequest.Builder().build(),object:InterstitialAdLoadCallback(){
                override fun onAdFailedToLoad(error:LoadAdError)=onMain{failure(error.code,error.domain,error.message,error.responseInfo)}
                override fun onAdLoaded(ad:InterstitialAd)=onMain {
                    if(!configured() || !loadState.loaded(ticket,SystemClock.elapsedRealtime())) {note("STALE_AD_IGNORED","request=$ticket");return@onMain}
                    cancelWatchdog();mInterstitialAd=ad
                    _interstitialDiagnostics.value=_interstitialDiagnostics.value.copy(lastFailure=null)
                    note("LOAD_READY","request=$ticket elapsedMs=${SystemClock.elapsedRealtime()-now} ${responseDetails(ad.responseInfo)}")
                }
            })
        } catch(error:RuntimeException){failure(0,"app",error.message ?: "SDK load exception",null)}
    }
    fun isInterstitialReady(): Boolean {
        if(Looper.myLooper()!=Looper.getMainLooper())return false
        val expired=expireCached()
        if(expired)loadMain("expired_cache")
        return mInterstitialAd!=null && loadState.ready(SystemClock.elapsedRealtime())
    }
    fun notePlacementBlocked(placement:AdPlacement,reason:String)=onMain{note("PLACEMENT_SKIPPED","${placement.key}: $reason")}
    fun updateUsageDiagnostics(remainingSeconds:Long,pausedReason:String?)=onMain {
        _interstitialDiagnostics.value=_interstitialDiagnostics.value.copy(usageRemainingSeconds=remainingSeconds,timerPausedReason=pausedReason)
    }
    fun diagnosticReport():String {
        val value=_interstitialDiagnostics.value;val config=AdPolicy.config.value;val now=SystemClock.elapsedRealtime()
        return buildString {
            appendLine("Madds ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE}), debug=${BuildConfig.DEBUG}")
            appendLine("Interstitial: ${value.readiness}")
            appendLine("Unit: ${BuildConfig.AD_UNIT_ID_INTERSTITIAL}")
            appendLine("Master enabled: ${config.enabled}; interval: ${config.timedIntervalSeconds}s; gap: ${config.minGapSeconds}s")
            appendLine("Enabled placements: ${config.placements.filterValues{it}.keys.joinToString()}")
            appendLine("Cache age: ${value.cachedAtUptime?.let{(now-it)/1000} ?: "none"}s; retry in: ${((value.retryAtUptime-now).coerceAtLeast(0)+999)/1000}s")
            appendLine("Usage timer: ${value.usageRemainingSeconds ?: "unknown"}s remaining; pause: ${value.timerPausedReason ?: "none"}")
            appendLine("Last failure: ${value.lastFailure ?: "none"}")
            value.events.forEach{appendLine("${java.util.Date(it.timeMs)} ${it.event} ${it.detail}")}
        }
    }
    /** An unready ad never turns into a delayed popup after navigation. */
    fun showPlacement(activity:Activity,placement:AdPlacement,onShown:()->Unit={}):Boolean {
        if(Looper.myLooper()!=Looper.getMainLooper())return false
        if(placement!=AdPlacement.TIMED_NAVIGATION)AdPolicy.gate.action()
        val config=AdPolicy.config.value
        val gateReason=AdPolicy.gate.blockedReason(SystemClock.elapsedRealtime(),config.minGapSeconds,placement!=AdPlacement.TIMED_NAVIGATION)
        val skip=when {
            diagnosticOverlayVisible -> "DIAGNOSTICS_OPEN"
            !config.enabled -> "MASTER_OFF"
            !config.allows(placement) -> "PLACEMENT_OFF"
            activity.isFinishing || activity.isDestroyed -> "ACTIVITY_UNAVAILABLE"
            isFullScreenAdShowing() -> "ANOTHER_FULL_SCREEN_AD"
            gateReason!=null -> gateReason
            !sdkReady -> "SDK_INITIALIZING"
            !isInterstitialReady() -> if(loadState.activeRequest!=null)"AD_LOADING" else if(!online())"OFFLINE" else if(SystemClock.elapsedRealtime()<loadState.retryAt)"RETRY_BACKOFF" else "NO_CACHED_AD"
            else -> null
        }
        if(skip!=null){notePlacementBlocked(placement,skip);if(config.allows(placement))loadInterstitial(activity);return false}
        val ad=mInterstitialAd ?: return false
        mInterstitialAd=null;loadState.consume();isInterstitialShowing=true
        var finished=false;var didShow=false
        fun shown() {
            if(finished || didShow)return
            didShow=true;AdPolicy.gate.shown(SystemClock.elapsedRealtime())
            note("SHOWN","placement=${placement.key} ${responseDetails(ad.responseInfo)}")
            runCatching(onShown)
            loadMain("replacement_while_showing",duringAd=true)
        }
        fun finish(event:String,detail:String="") {
            if(finished)return
            if(event=="DISMISSED" && !didShow)shown()
            finished=true;isInterstitialShowing=false
            if(!didShow && event in listOf("SHOW_FAILED","SHOW_EXCEPTION"))loadState.showFailed(SystemClock.elapsedRealtime())
            if(event=="SHOW_EXCEPTION")_interstitialDiagnostics.value=_interstitialDiagnostics.value.copy(lastFailure="SHOW_EXCEPTION: $detail")
            if(didShow)AdPolicy.gate.shown(SystemClock.elapsedRealtime())
            note(event,"placement=${placement.key} $detail")
            loadMain("replacement_after_close")
        }
        ad.fullScreenContentCallback=object:FullScreenContentCallback(){
            override fun onAdShowedFullScreenContent()=onMain{shown()}
            override fun onAdImpression()=onMain{shown()}
            override fun onAdDismissedFullScreenContent()=onMain{finish("DISMISSED")}
            override fun onAdFailedToShowFullScreenContent(error:com.google.android.gms.ads.AdError)=onMain {
                _interstitialDiagnostics.value=_interstitialDiagnostics.value.copy(lastFailure="SHOW_FAILED code=${error.code} domain=${error.domain} ${error.message.take(200)}")
                finish("SHOW_FAILED","code=${error.code} domain=${error.domain} ${error.message.take(200)}")
            }
        }
        note("SHOW_REQUESTED","placement=${placement.key} ${responseDetails(ad.responseInfo)}")
        try{ad.show(activity)}catch(error:RuntimeException){finish("SHOW_EXCEPTION",error.message ?: "SDK show exception")}
        return !finished || didShow
    }

    // Rewarded behavior and server-side credit verification remain independent.
    private var mRewardedAd: RewardedAd? = null
    private val _rewardedAdState = MutableStateFlow<RewardedAdLoadState>(RewardedAdLoadState.Idle)
    val rewardedAdState: StateFlow<RewardedAdLoadState> = _rewardedAdState.asStateFlow()

    /**
     * Preloads a rewarded ad.
     */
    fun loadRewardedAd(context: Context) {
        if (!AdPolicy.config.value.let { it.enabled && it.rewardedEnabled } || mRewardedAd != null || _rewardedAdState.value is RewardedAdLoadState.Loading) return

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
        if (!AdPolicy.config.value.let { it.enabled && it.rewardedEnabled } || isFullScreenAdShowing()) { onAdDismissed(); return }
        if (mRewardedAd != null) {
            isRewardedShowing = true
            val options = ServerSideVerificationOptions.Builder()
                .setCustomData(customData)
                .build()
            mRewardedAd?.setServerSideVerificationOptions(options)

            mRewardedAd?.fullScreenContentCallback = object : FullScreenContentCallback() {
                override fun onAdDismissedFullScreenContent() {
                    isRewardedShowing = false
                    AdPolicy.gate.shown(android.os.SystemClock.elapsedRealtime())
                    Log.d(TAG, "Rewarded ad was dismissed.")
                    mRewardedAd = null
                    _rewardedAdState.value = RewardedAdLoadState.Idle
                    loadRewardedAd(activity)
                    onAdDismissed()
                }

                override fun onAdFailedToShowFullScreenContent(adError: com.google.android.gms.ads.AdError) {
                    isRewardedShowing = false
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
