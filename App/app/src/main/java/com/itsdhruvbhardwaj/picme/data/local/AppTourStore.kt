package com.itsdhruvbhardwaj.picme.data.local

import android.content.Context
import android.content.SharedPreferences

class AppTourStore(private val prefs:SharedPreferences) {
    constructor(context:Context):this(context.getSharedPreferences("madds_app_tour",Context.MODE_PRIVATE))
    fun seen(owner:String)=prefs.getInt("seen_$owner",0)>=1
    fun pending(owner:String)=prefs.getString("pending_$owner",null)
    fun finish(owner:String,action:String):Boolean {
        require(action in listOf("COMPLETE","SKIP"))
        return prefs.edit().putInt("seen_$owner",1).putString("pending_$owner",action).commit()
    }
    fun acknowledged(owner:String,action:String){if(pending(owner)==action)prefs.edit().remove("pending_$owner").apply()}
}
