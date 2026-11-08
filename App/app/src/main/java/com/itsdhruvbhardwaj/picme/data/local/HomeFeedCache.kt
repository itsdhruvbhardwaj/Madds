package com.itsdhruvbhardwaj.picme.data.local

import android.content.Context
import com.google.gson.Gson
import com.itsdhruvbhardwaj.picme.data.model.HomeConfigResponse

/** Only public catalogue data is persisted; never tokens or account preferences. */
class HomeFeedCache(context: Context) {
    private val preferences = context.getSharedPreferences("home_catalog_cache", Context.MODE_PRIVATE)
    private val gson = Gson()

    fun read(preference: String = "all"): HomeConfigResponse? = try {
        preferences.getString(if (preference == "all") "feed_v1" else "feed_v1_$preference", null)?.let {
            gson.fromJson(it, HomeConfigResponse::class.java)
        }
    } catch (_: Exception) { null }

    fun write(feed: HomeConfigResponse, preference: String = "all") {
        val publicFeed = feed.copy(sections = feed.sections.map { section ->
            section.copy(styles = section.styles?.map { it.copy(isFavorite = false) })
        })
        preferences.edit().putString(if (preference == "all") "feed_v1" else "feed_v1_$preference", gson.toJson(publicFeed)).apply()
    }
}
