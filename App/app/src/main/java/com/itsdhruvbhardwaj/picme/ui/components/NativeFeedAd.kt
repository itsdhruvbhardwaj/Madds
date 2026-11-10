package com.itsdhruvbhardwaj.picme.ui.components

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

/** Holds a bounded number of ads for a screen, not an unbounded ad per feed row. */
@Stable class NativeFeedSlot {
    var ad by mutableStateOf<NativeAd?>(null);private set
    private var closed=false
    private var loading=false
    private var nextAttempt=0L
    private var loadedAt=0L
    fun load(context:Context) {
        val now=SystemClock.elapsedRealtime()
        if(closed||loading||now<nextAttempt)return
        if(ad!=null && now-loadedAt<55*60_000L)return
        ad?.destroy();ad=null
        loading=true;nextAttempt=now+60_000
        try { AdLoader.Builder(context,BuildConfig.AD_UNIT_ID_NATIVE)
            .forNativeAd { loaded ->
                loading=false
                if(closed)loaded.destroy() else {ad?.destroy();ad=loaded;loadedAt=SystemClock.elapsedRealtime()}
            }
            .withNativeAdOptions(NativeAdOptions.Builder().setVideoOptions(VideoOptions.Builder().setStartMuted(true).build()).setAdChoicesPlacement(NativeAdOptions.ADCHOICES_TOP_RIGHT).build())
            .withAdListener(object:AdListener(){override fun onAdFailedToLoad(error:LoadAdError){loading=false}})
            .build().loadAd(AdRequest.Builder().build())
        } catch (_:RuntimeException) { loading=false }
    }
    fun close(){closed=true;ad?.destroy();ad=null}
}

@Composable fun rememberNativeFeedSlots(enabled:Boolean,count:Int,resetKey:Int=0):List<NativeFeedSlot> {
    val slots=remember(enabled,count,resetKey){List(count){NativeFeedSlot()}}
    DisposableEffect(slots){onDispose{slots.forEach{it.close()}}}
    return slots
}

/** Null slot indices suppress trailing/dense ads and bound retained SDK resources. */
fun nativeFeedSlotIndex(index:Int,count:Int,every:Int,maxAds:Int,hasMore:Boolean=false):Int? {
    if(index<0||index>=count||count<=0||every<1||(index+1)%every!=0||(!hasMore&&index>=count-1))return null
    return ((index+1)/every-1).takeIf{it in 0 until maxAds}
}

@Composable fun NativeFeedAd(slot:NativeFeedSlot) {
    val context=LocalContext.current
    LaunchedEffect(slot){slot.load(context.applicationContext)}
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
