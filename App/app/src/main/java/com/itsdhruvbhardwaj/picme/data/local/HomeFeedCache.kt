package com.itsdhruvbhardwaj.picme.data.local

import android.content.Context
import com.google.gson.Gson
import com.itsdhruvbhardwaj.picme.data.model.HomeConfigResponse

/** Only public catalogue data is persisted; never tokens or account preferences. */
class HomeFeedCache(context: Context) {
    private val preferences = context.getSharedPreferences("home_catalog_cache", Context.MODE_PRIVATE)
    private val gson = Gson()

    fun read(): HomeConfigResponse? = try {
        preferences.getString("feed_v1", null)?.let {
            gson.fromJson(it, HomeConfigResponse::class.java)
        }
    } catch (_: Exception) { null }

    fun write(feed: HomeConfigResponse) {
        val publicFeed = feed.copy(sections = feed.sections.map { section ->
            section.copy(styles = section.styles?.map { it.copy(isFavorite = false) })
        })
        preferences.edit().putString("feed_v1", gson.toJson(publicFeed)).apply()
    }
}
