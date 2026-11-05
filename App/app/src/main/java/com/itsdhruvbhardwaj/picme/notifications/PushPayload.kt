package com.itsdhruvbhardwaj.picme.notifications

import com.google.gson.JsonParser
import okio.ByteString.Companion.decodeBase64

enum class PushCategory(val key: String, val label: String, val description: String) {
    NEW_STYLES("newStyles", "New Styles & Trends", "Discover newly published styles"),
    OFFERS("offers", "Offers & Rewards", "Hear about offers and rewards"),
    UPDATES("productUpdates", "Product Updates", "What's new in madds"),
    REENGAGEMENT("reengagement", "Reminders", "Inspiration when you haven't visited recently");
    val channelId: String get() = "madds_$key"
}

data class PushSession(val userId: String, val sessionId: String) {
    companion object {
        fun fromToken(token: String?): PushSession? = runCatching {
            val payload = token?.split('.')?.getOrNull(1)?.decodeBase64()?.utf8() ?: return null
            val json = JsonParser.parseString(payload).asJsonObject
            val sub = json["sub"].asString; val sid = json["sid"].asString
            if (!objectId.matches(sub) || !objectId.matches(sid)) null else PushSession(sub, sid)
        }.getOrNull()
    }
}

const val APP_UPDATE_LINK = "https://play.google.com/store/apps/details?id=com.itsdhruvbhardwaj.picme"

private val objectId = Regex("[a-fA-F0-9]{24}")
private val slug = Regex("[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?")

data class PushPayload(val title: String, val body: String, val category: PushCategory,
    val deliveryId: String, val campaignId: String, val userId: String, val bindingVersion: Long,
    val styleId: String?, val collectionId: String?, val imageUrl: String?, val deepLink: String) {
    companion object {
        fun parse(data: Map<String, String>): PushPayload? = runCatching {
            val title = data["title"]?.takeIf { it.isNotBlank() && it.length <= 120 } ?: return null
            val body = data["body"]?.takeIf { it.isNotBlank() && it.length <= 500 } ?: return null
            val expectedCategory = when (data["type"]) {
                "NEW_STYLE" -> PushCategory.NEW_STYLES; "OFFER" -> PushCategory.OFFERS
                "PRODUCT_UPDATE", "APP_UPDATE" -> PushCategory.UPDATES; "REENGAGEMENT" -> PushCategory.REENGAGEMENT
                else -> return null
            }
            if (data["category"] != expectedCategory.key) return null
            val id = data["deliveryId"]?.takeIf(objectId::matches) ?: return null
            val campaign = data["campaignId"]?.takeIf(objectId::matches) ?: return null
            val user = data["recipientUserId"]?.takeIf(objectId::matches) ?: return null
            val version = data["bindingVersion"]?.toLongOrNull()?.takeIf { it in 1..9_007_199_254_740_991L } ?: return null
            val style = data["styleId"]; val collection = data["collectionId"]
            if ((style != null && !slug.matches(style)) || (collection != null && !slug.matches(collection)) || (style != null && collection != null)) return null
            if (expectedCategory == PushCategory.NEW_STYLES && style == null) return null
            val update = data["type"] == "APP_UPDATE"
            if (update && (style != null || collection != null)) return null
            val link = if (update) APP_UPDATE_LINK else if (style != null) "picme://styles/$style" else if (collection != null) "picme://collections/$collection" else "picme://home"
            if (data["deepLink"] != link) return null
            PushPayload(title, body, expectedCategory, id, campaign, user, version, style, collection,
                data["imageUrl"]?.takeIf(::isSafePushImage), link)
        }.getOrNull()
    }
}

fun isSafePushImage(value: String): Boolean = runCatching {
    val uri = java.net.URI(value)
    value.length <= 1000 && uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null
}.getOrDefault(false)

/** Independent of Android so account boundaries can be tested without a device. */
fun canReceivePush(payload: PushPayload, session: PushSession?, cachedUserId: String?,
    boundSession: PushSession?, firstVersion: Long, lastVersion: Long,
    optedIn: Boolean, hasSession: Boolean, alreadySeen: Boolean): Boolean =
    session != null && session == boundSession && session.userId == cachedUserId &&
        payload.userId == session.userId && payload.bindingVersion in firstVersion..lastVersion &&
        firstVersion > 0 && optedIn && hasSession && !alreadySeen
