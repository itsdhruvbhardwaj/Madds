package com.itsdhruvbhardwaj.picme.ui.components

import kotlinx.coroutines.launch
import kotlinx.coroutines.cancel
import kotlinx.coroutines.isActive
import kotlinx.coroutines.flow.collect
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.repeatOnLifecycle
import android.content.Context
import android.graphics.Color as AndroidColor
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.google.android.gms.ads.*
import com.google.android.gms.ads.nativead.*
import com.itsdhruvbhardwaj.picme.BuildConfig

/** SDK objects live no longer than the activity, and are bounded to two Home/three Explore slots. */
@Stable class NativeFeedSlot {
    var ad by mutableStateOf<NativeAd?>(null); private set
    private var closed = false
    private var loadedAt = 0L
    private var serial = 0
    private val retry = NativeAdRetryState()
    private var driver: kotlinx.coroutines.Job? = null
    private val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + kotlinx.coroutines.Dispatchers.Main.immediate)
    private fun note(event: String) { if (BuildConfig.DEBUG) android.util.Log.d("MaddsNativeAd", event) }

    fun activate(context: Context, active: Boolean) {
        if (!active) { driver?.cancel(); driver = null; return }
        if (closed || driver?.isActive == true) return
        driver = scope.launch {
            while (kotlinx.coroutines.currentCoroutineContext().isActive) {
                val now = SystemClock.elapsedRealtime()
                if (retry.timedOut(now)) { serial++; retry.failed(now); note("LOAD_TIMEOUT") }
                if ((ad == null || now - loadedAt >= 55 * 60_000L) && retry.canStart(now)) load(context)
                kotlinx.coroutines.delay(250)
            }
        }
    }

    private fun load(context: Context) {
        ad?.destroy(); ad = null
        retry.start(SystemClock.elapsedRealtime())
        val request = ++serial
        note("LOAD_STARTED")
        try {
            AdLoader.Builder(context.applicationContext, BuildConfig.AD_UNIT_ID_NATIVE)
                .forNativeAd { loaded ->
                    if (closed || request != serial) loaded.destroy()
                    else {
                        retry.succeeded(); ad?.destroy(); ad = loaded
                        loadedAt = SystemClock.elapsedRealtime(); note("LOAD_READY")
                    }
                }
                .withNativeAdOptions(NativeAdOptions.Builder().setVideoOptions(VideoOptions.Builder().setStartMuted(true).build())
                    .setAdChoicesPlacement(NativeAdOptions.ADCHOICES_TOP_RIGHT).build())
                .withAdListener(object : AdListener() {
                    override fun onAdFailedToLoad(error: LoadAdError) {
                        if (closed || request != serial) return
                        retry.failed(SystemClock.elapsedRealtime(), error.code == AdRequest.ERROR_CODE_INVALID_REQUEST)
                        note("LOAD_FAILED code=${error.code} domain=${error.domain}")
                    }
                }).build().loadAd(AdRequest.Builder().build())
        } catch (_: RuntimeException) {
            retry.failed(SystemClock.elapsedRealtime()); note("LOAD_EXCEPTION")
        }
    }
    fun close() { closed = true; serial++; scope.cancel(); ad?.destroy(); ad = null }
}

class NativeFeedCacheViewModel : androidx.lifecycle.ViewModel() {
    private data class Group(val count: Int, val reset: Int, val slots: List<NativeFeedSlot>)
    private val groups = mutableMapOf<String, Group>()
    init {
        viewModelScope.launch {
            com.itsdhruvbhardwaj.picme.utils.AdPolicy.config.collect { config ->
                groups.keys.toList().forEach { key ->
                    if (!config.enabled || (key == "home" && !config.nativeHomeEnabled) || (key == "explore" && !config.nativeExploreEnabled))
                        groups.remove(key)?.slots?.forEach { it.close() }
                }
            }
        }
    }
    fun slots(key: String, count: Int, reset: Int): List<NativeFeedSlot> {
        val existing = groups[key]
        if (existing?.count == count && existing.reset == reset) return existing.slots
        existing?.slots?.forEach { it.close() }
        return List(count) { NativeFeedSlot() }.also { groups[key] = Group(count, reset, it) }
    }
    override fun onCleared() { groups.values.forEach { it.slots.forEach(NativeFeedSlot::close) }; groups.clear() }
}

@Composable fun rememberNativeFeedSlots(enabled: Boolean, count: Int, resetKey: Int = 0, screenKey: String): List<NativeFeedSlot> {
    var current: Context = LocalContext.current
    while (current is android.content.ContextWrapper && current !is androidx.activity.ComponentActivity) current = current.baseContext
    val owner = current as androidx.activity.ComponentActivity
    val cache = remember(owner) { androidx.lifecycle.ViewModelProvider(owner)[NativeFeedCacheViewModel::class.java] }
    return remember(cache, enabled, count, resetKey, screenKey) { cache.slots(screenKey, count, resetKey) }
}

/** Preload first placement immediately, then subsequent placements shortly before arrival. */
@Composable fun PreloadNativeFeedAds(slots: List<NativeFeedSlot>, enabled: Boolean,
    placements: List<Pair<Int, Int>>, listState: androidx.compose.foundation.lazy.LazyListState) {
    val context = LocalContext.current.applicationContext
    val lifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current.lifecycle
    val sdkReady by com.itsdhruvbhardwaj.picme.utils.AdManager.nativeSdkReady.collectAsState()
    LaunchedEffect(slots, enabled, placements, lifecycle, sdkReady) {
        try {
            if (enabled && sdkReady && placements.isNotEmpty()) lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.RESUMED) {
                try {
                    snapshotFlow { listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0 }.collect { visible ->
                        val wanted = placements.filterIndexed { index, pair -> index == 0 || pair.first <= visible + 2 }.map { it.second }.toSet()
                        slots.forEachIndexed { index, slot -> slot.activate(context, index in wanted) }
                    }
                } finally { slots.forEach { it.activate(context, false) } }
            }
        } finally { slots.forEach { it.activate(context, false) } }
    }
}

/** Null slot indices suppress trailing/dense ads and bound retained SDK resources. */
fun nativeFeedSlotIndex(index:Int,count:Int,every:Int,maxAds:Int,hasMore:Boolean=false):Int? {
    if(index<0||index>=count||count<=0||every<1||(index+1)%every!=0||(!hasMore&&index>=count-1))return null
    return ((index+1)/every-1).takeIf{it in 0 until maxAds}
}

@Composable fun NativeFeedAd(slot:NativeFeedSlot) {
    val ad=slot.ad ?: return
    // SDK handles all ad clicks and AdChoices. No custom click listeners or overlays.
    key(ad) {
        AndroidView(factory={ctx->createNativeFeedView(ctx,ad)},
            modifier=Modifier.fillMaxWidth().padding(horizontal=16.dp,vertical=12.dp),
            onRelease={it.destroy()})
    }
}

private fun createNativeFeedView(context:Context,ad:NativeAd):NativeAdView {
    fun px(dp:Int)=(dp*context.resources.displayMetrics.density).toInt()
    val gold=AndroidColor.rgb(225,196,119)
    fun text(size:Float,color:Int=AndroidColor.WHITE)=TextView(context).apply{setTextSize(size);setTextColor(color)}
    fun spacing(height:Int)=Space(context).apply{layoutParams=LinearLayout.LayoutParams(1,px(height))}
    val view=NativeAdView(context)
    val content=LinearLayout(context).apply{
        orientation=LinearLayout.VERTICAL;setPadding(px(16),px(16),px(16),px(16))
        background=GradientDrawable().apply{setColor(AndroidColor.rgb(25,26,25));cornerRadius=px(20).toFloat();setStroke(px(1),AndroidColor.rgb(70,68,58))}
    }
    view.addView(content,ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT))
    val attribution=text(12f,gold).apply{text="Ad";setTypeface(typeface,Typeface.BOLD);setPadding(0,0,px(40),0)}
    content.addView(attribution);content.addView(spacing(12))
    val heading=LinearLayout(context).apply{orientation=LinearLayout.HORIZONTAL;gravity=android.view.Gravity.CENTER_VERTICAL}
    val icon=ImageView(context).apply{
        layoutParams=LinearLayout.LayoutParams(px(44),px(44)).apply{marginEnd=px(12)}
        scaleType=ImageView.ScaleType.CENTER_CROP
        if(ad.icon?.drawable!=null)setImageDrawable(ad.icon?.drawable)else visibility=View.GONE
    }
    heading.addView(icon);view.iconView=icon
    val headline=text(18f).apply{text=ad.headline;maxLines=2;setTypeface(typeface,Typeface.BOLD)}
    heading.addView(headline,LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1f));view.headlineView=headline
    content.addView(heading)
    val advertiser=text(12f,AndroidColor.LTGRAY).apply{text=ad.advertiser;visibility=if(ad.advertiser.isNullOrBlank())View.GONE else View.VISIBLE}
    content.addView(advertiser);view.advertiserView=advertiser
    content.addView(spacing(12))
    val media=MediaView(context).apply{layoutParams=LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,px(180));mediaContent=ad.mediaContent;visibility=if(ad.mediaContent==null)View.GONE else View.VISIBLE}
    content.addView(media);view.mediaView=media
    val body=text(14f,AndroidColor.LTGRAY).apply{text=ad.body;maxLines=3;setPadding(0,px(12),0,px(12));visibility=if(ad.body.isNullOrBlank())View.GONE else View.VISIBLE}
    content.addView(body);view.bodyView=body
    val cta=Button(context).apply{
        text=ad.callToAction;isAllCaps=false;setTextColor(AndroidColor.BLACK);setTextSize(15f)
        minHeight=px(48);background=GradientDrawable().apply{setColor(gold);cornerRadius=px(14).toFloat()}
        visibility=if(ad.callToAction.isNullOrBlank())View.GONE else View.VISIBLE
    }
    content.addView(cta,LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT));view.callToActionView=cta
    view.setNativeAd(ad)
    return view
}
