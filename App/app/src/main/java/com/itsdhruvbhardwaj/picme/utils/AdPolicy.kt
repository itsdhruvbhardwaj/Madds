package com.itsdhruvbhardwaj.picme.utils

import android.content.Context
import android.os.SystemClock
import com.itsdhruvbhardwaj.picme.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

enum class AdPlacement(val key:String) {
    GENERATION_CONTINUE("generation_continue"), AVATAR_SAVED("avatar_saved"),
    BUY_MORE("buy_more"), MY_GENERATIONS("my_generations"), HOME_SEE_ALL("home_see_all"), COLLECTION_OPEN("collection_open"),
    IMAGE_DOWNLOAD("image_download"), APPEARANCE_APPLIED("appearance_applied"), TIMED_NAVIGATION("timed_navigation")
}
data class AdConfig(
    val enabled:Boolean=true, val bannersEnabled:Boolean=true, val rewardedEnabled:Boolean=true,
    val nativeHomeEnabled:Boolean=false, val nativeExploreEnabled:Boolean=false,
    val homeNativeEverySections:Int=3, val exploreNativeEveryStyles:Int=12,
    val minGapSeconds:Int=90, val timedIntervalSeconds:Int=120,
    val placements:Map<String,Boolean> = AdPlacement.entries.associate { it.key to (it in listOf(AdPlacement.GENERATION_CONTINUE,AdPlacement.TIMED_NAVIGATION)) }
) {
    fun allows(placement:AdPlacement)=enabled && placements[placement.key]==true
}

/** Shared gate across placements, so enabling more switches cannot produce consecutive ads. */
class InterstitialGate {
    private var lastShown:Long?=null
    private var actions=0
    fun action(){ actions=(actions+1).coerceAtMost(2) }
    fun blockedReason(now:Long,gapSeconds:Int,requireActions:Boolean=true):String? = when {
        lastShown?.let{now-it<gapSeconds*1000L}==true -> "COOLDOWN"
        requireActions && actions<2 -> "ACTION_SPACING"
        else -> null
    }
    fun allowed(now:Long,gapSeconds:Int,requireActions:Boolean=true):Boolean = blockedReason(now,gapSeconds,requireActions)==null
    fun shown(now:Long){lastShown=now;actions=0}
}

object AdPolicy {
    private val mutable=MutableStateFlow(AdConfig())
    val config=mutable.asStateFlow()
    val gate=InterstitialGate()
    private val mutex=Mutex()
    private var initialized=false
    private var nextRefresh=0L
    private val client=OkHttpClient.Builder().connectTimeout(5,TimeUnit.SECONDS).readTimeout(5,TimeUnit.SECONDS).callTimeout(8,TimeUnit.SECONDS).build()
    fun initialize(context:Context){
        if(initialized)return
        initialized=true
        context.getSharedPreferences("madds_ads",Context.MODE_PRIVATE).getString("config",null)?.let{ parse(it)?.let{value->mutable.value=value} }
    }
    suspend fun refresh(context:Context)=withContext(Dispatchers.IO){
        mutex.withLock {
            initialize(context)
            val now=SystemClock.elapsedRealtime()
            if(now<nextRefresh)return@withLock
            // A failure backs off too; no per-tap requests and no retry storm.
            nextRefresh=now+300_000
            try {
                val url=BuildConfig.BACKEND_BASE_URL.trimEnd('/')+"/api/app-config/ads"
                client.newCall(Request.Builder().url(url).build()).execute().use{response->
                    if(!response.isSuccessful)return@use
                    val body=response.body?.string()?:return@use
                    val parsed=parse(body)?:return@use
                    context.getSharedPreferences("madds_ads",Context.MODE_PRIVATE).edit().putString("config",body).apply()
                    mutable.value=parsed
                }
            } catch(_:Exception){ /* Keep the last valid configuration during an outage. */ }
        }
    }
    private fun parse(body:String):AdConfig?=runCatching{
        val json=JSONObject(body)
        require(json.getBoolean("ok"))
        val gap=json.getInt("minGapSeconds");val interval=json.getInt("timedIntervalSeconds")
        require(gap in 60..3600 && interval in 60..3600)
        val placements=json.getJSONObject("placements")
        val homeSpacing=json.optInt("homeNativeEverySections",3)
        val exploreSpacing=json.optInt("exploreNativeEveryStyles",12)
        require(homeSpacing in 2..10 && exploreSpacing in 12..60 && exploreSpacing%6==0)
        AdConfig(enabled=json.getBoolean("enabled"),bannersEnabled=json.getBoolean("bannersEnabled"),rewardedEnabled=json.getBoolean("rewardedEnabled"),
            nativeHomeEnabled=json.optBoolean("nativeHomeEnabled",false),nativeExploreEnabled=json.optBoolean("nativeExploreEnabled",false),
            homeNativeEverySections=homeSpacing,exploreNativeEveryStyles=exploreSpacing,minGapSeconds=gap,timedIntervalSeconds=interval,
            placements=
            AdPlacement.entries.associate{it.key to if(it==AdPlacement.COLLECTION_OPEN) placements.optBoolean(it.key,false) else placements.getBoolean(it.key)})
    }.getOrNull()
}
