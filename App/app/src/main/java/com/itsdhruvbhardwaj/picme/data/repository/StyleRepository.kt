package com.itsdhruvbhardwaj.picme.data.repository

import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.local.HomeFeedCache
import com.itsdhruvbhardwaj.picme.data.model.HomeConfigResponse
import com.itsdhruvbhardwaj.picme.data.model.StyleCollection
import com.itsdhruvbhardwaj.picme.data.model.Style
import com.itsdhruvbhardwaj.picme.data.model.StyleResponse
import com.itsdhruvbhardwaj.picme.data.remote.StyleApiService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.SocketTimeoutException

class StyleRepository(
    private val apiService: StyleApiService,
    private val tokenStorage: AuthTokenStorage,
    private val homeFeedCache: HomeFeedCache? = null,
    private val discoverySeed: String = DiscoverySession.seed,
    private val exploreFeedCache: com.itsdhruvbhardwaj.picme.data.local.ExploreFeedCache? = null
) {
    private val _stylePreference = MutableStateFlow(tokenStorage.getUser()?.id?.let { tokenStorage.getStylePreference(it) } ?: "all")
    val stylePreference = _stylePreference.asStateFlow()
    private var preferenceOwner: String? = null
    private var preferenceRevision = 0
    suspend fun syncStylePreference(userId: String?) {
        val revision = ++preferenceRevision
        preferenceOwner = userId
        _stylePreference.value = userId?.let { tokenStorage.getStylePreference(it) } ?: "all"
        if (userId == null) return
        val token = tokenStorage.getAccessToken() ?: return
        try {
            val response = apiService.stylePreference("Bearer $token")
            if (preferenceOwner == userId && revision == preferenceRevision && response.isSuccessful) {
                _stylePreference.value = response.body()?.preference?.takeIf { it in listOf("all", "male", "female") } ?: "all"
                tokenStorage.saveStylePreference(userId, _stylePreference.value)
            }
        } catch (e: CancellationException) { throw e } catch (_: Exception) { }
    }
    suspend fun saveStylePreference(value: String): Result<Unit> {
        val owner = preferenceOwner ?: return Result.failure(Exception("Please sign in again."))
        val token = tokenStorage.getAccessToken() ?: return Result.failure(Exception("Please sign in again."))
        val revision = ++preferenceRevision
        return try {
            val response = apiService.saveStylePreference("Bearer $token", com.itsdhruvbhardwaj.picme.data.remote.StylePreferenceResponse(value))
            if (preferenceOwner != owner || revision != preferenceRevision) Result.failure(Exception("Your account changed."))
            else if (response.isSuccessful && response.body()?.preference == value) {
                tokenStorage.saveStylePreference(owner, value)
                _stylePreference.value = value
                Result.success(Unit)
            } else Result.failure(Exception("Couldn't save your preference. Please try again."))
        } catch (e: CancellationException) { throw e } catch (_: Exception) {
            Result.failure(Exception("Couldn't save your preference. Check your connection."))
        }
    }

    fun acceptSavedPreference(userId: String, value: String) {
        if (tokenStorage.getUser()?.id != userId || value !in listOf("all", "male", "female")) return
        ++preferenceRevision // Invalidate an older initial sync response.
        tokenStorage.saveStylePreference(userId, value)
        _stylePreference.value = value
    }

    private val _cachedStyles = MutableStateFlow<Map<String, Style>>(emptyMap())
    val cachedStyles: StateFlow<Map<String, Style>> = _cachedStyles.asStateFlow()

    suspend fun getCachedExplore(preference: String, collection: String?, query: String): List<Style>? =
        withContext(Dispatchers.IO) {
            exploreFeedCache?.read(preference, collection, query)?.also { styles ->
                _cachedStyles.update { existing ->
                    existing + styles.associate { it.id to it.copy(isFavorite = existing[it.id]?.isFavorite ?: false) }
                }
            }
        }

    suspend fun saveExploreCache(preference: String, collection: String?, query: String, styles: List<Style>) {
        withContext(Dispatchers.IO) { exploreFeedCache?.write(preference, collection, query, styles) }
    }

    fun getCachedHome(): HomeConfigResponse? = homeFeedCache?.read(_stylePreference.value)?.also { cacheHomeStyles(it) }

    fun saveHomeCache(feed: HomeConfigResponse) {
        cacheHomeStyles(feed)
        homeFeedCache?.write(feed, _stylePreference.value)
    }

    private fun cacheHomeStyles(feed: HomeConfigResponse) {
        _cachedStyles.update { existing ->
            existing + feed.sections.flatMap { it.styles.orEmpty() }.associate { style ->
                style.id to style.copy(isFavorite = existing[style.id]?.isFavorite ?: false)
            }
        }
    }

    suspend fun getStyles(
        page: Int,
        limit: Int,
        collection: String? = null,
        search: String? = null,
        trendingFirst: Boolean = false
    ): Result<StyleResponse> = withContext(Dispatchers.IO) {
        retryIO {
            try {
                val token = tokenStorage.getAccessToken()
                val authHeader = token?.let { "Bearer $it" }
                val response = apiService.getStyles(authHeader, page, limit, collection, search, trendingFirst, _stylePreference.value, discoverySeed)
                
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    _cachedStyles.update { currentCache ->
                        currentCache + body.styles.associateBy { it.id }
                    }
                    Result.success(body)
                } else {
                    val message = when (response.code()) {
                        401 -> "session_expired"
                        in 500..599 -> "server_overloaded"
                        else -> "failed_to_load_styles"
                    }
                    Result.failure(Exception(message))
                }
            } catch (e: SocketTimeoutException) {
                Result.failure(Exception("timeout"))
            } catch (e: IOException) {
                Result.failure(Exception("network_error"))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    suspend fun getFavorites(): Result<List<Style>> = withContext(Dispatchers.IO) {
        try {
            val token = tokenStorage.getAccessToken() ?: return@withContext Result.failure(Exception("unauthorized"))
            val response = apiService.getFavorites("Bearer $token")
            
            if (response.isSuccessful && response.body() != null) {
                // Ensure isFavorite is true for all styles from favorites endpoint
                val favorites = response.body()!!.favorites.map { it.copy(isFavorite = true) }
                _cachedStyles.update { currentCache ->
                    currentCache + favorites.associateBy { it.id }
                }
                Result.success(favorites)
            } else {
                Result.failure(Exception("failed_to_load_favorites"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun toggleFavorite(styleId: String, isFavorite: Boolean): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val token = tokenStorage.getAccessToken() ?: return@withContext Result.failure(Exception("unauthorized"))
            val response = if (isFavorite) {
                apiService.addFavorite("Bearer $token", styleId)
            } else {
                apiService.removeFavorite("Bearer $token", styleId)
            }

            if (response.isSuccessful) {
                _cachedStyles.update { currentCache ->
                    val style = currentCache[styleId]
                    if (style != null) {
                        currentCache + (styleId to style.copy(isFavorite = isFavorite))
                    } else {
                        currentCache
                    }
                }
                Result.success(Unit)
            } else {
                Result.failure(Exception("failed_to_update_favorite"))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getHomeConfig(): Result<HomeConfigResponse> = withContext(Dispatchers.IO) {
        retryIO {
            try {
                val response = apiService.getHomeConfig(gender = _stylePreference.value, shuffleSeed = discoverySeed)
                if (response.isSuccessful && response.body() != null) {
                    val feed = response.body()!!
                    cacheHomeStyles(feed)
                    Result.success(feed)
                } else {
                    Result.failure(Exception(when (response.code()) {
                        401, 403 -> "session_expired"
                        429, in 500..599 -> "server_overloaded"
                        else -> "failed_to_load_config"
                    }))
                }
            } catch (e: SocketTimeoutException) {
                Result.failure(Exception("timeout"))
            } catch (e: IOException) {
                Result.failure(Exception("network_error"))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    suspend fun getCollections(): Result<List<StyleCollection>> = withContext(Dispatchers.IO) {
        retryIO {
            try {
                val response = apiService.getCollections(_stylePreference.value)
                if (response.isSuccessful && response.body() != null) {
                    Result.success(response.body()!!.collections)
                } else if (response.code() == 404) {
                    // Only fall back for older servers, never scan the catalogue during an outage.
                    // Build a usable list from the public styles API while that deploy catches up.
                    val fallback = getCollectionsFromStyles()
                    if (fallback.isSuccess) fallback
                    else Result.failure(Exception("failed_to_load_collections_http_${response.code()}"))
                } else {
                    Result.failure(Exception(if (response.code() in 500..599 || response.code() == 429) "server_overloaded" else "failed_to_load_collections"))
                }
            } catch (e: SocketTimeoutException) {
                Result.failure(Exception("timeout"))
            } catch (e: IOException) {
                Result.failure(Exception("network_error"))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    private suspend fun getCollectionsFromStyles(): Result<List<StyleCollection>> {
        data class CollectionSummary(var thumbnail: String? = null, var count: Int = 0)
        val summaries = linkedMapOf<String, CollectionSummary>()
        var page = 1
        var hasMore = true

        while (hasMore && page <= 100) {
            val result = getStyles(page = page, limit = 50)
            if (result.isFailure) return Result.failure(result.exceptionOrNull()!!)
            val response = result.getOrThrow()
            response.styles.forEach { style ->
                style.collections.forEach { name ->
                    val summary = summaries.getOrPut(name) { CollectionSummary() }
                    summary.count++
                    if (summary.thumbnail == null) {
                        summary.thumbnail = style.thumbnail?.takeIf(String::isNotBlank)
                            ?: style.previewImages?.firstOrNull()?.takeIf(String::isNotBlank)
                    }
                }
            }
            hasMore = response.pagination.hasNextPage
            page++
        }

        return Result.success(
            summaries.filterValues { it.count > 0 }.toSortedMap(String.CASE_INSENSITIVE_ORDER).map { (name, summary) ->
                StyleCollection(
                    id = name.lowercase().trim().replace(Regex("[^a-z0-9]+"), "-").trim('-'),
                    name = name,
                    thumbnail = summary.thumbnail,
                    styleCount = summary.count
                )
            }
        )
    }

    private suspend fun <T> retryIO(block: suspend () -> Result<T>): Result<T> =
        withTimeoutOrNull(35_000) { retryAttempts(block = block) }
            ?: Result.failure(Exception("timeout"))

    private suspend fun <T> retryAttempts(
        times: Int = 3,
        initialDelay: Long = 1000,
        maxDelay: Long = 5000,
        factor: Double = 2.0,
        block: suspend () -> Result<T>
    ): Result<T> {
        var currentDelay = initialDelay
        repeat(times - 1) {
            val result = block()
            val exception = result.exceptionOrNull()
            if (result.isSuccess || (exception != null && exception.message !in listOf("timeout", "network_error", "server_overloaded"))) {
                return result
            }
            delay(currentDelay)
            currentDelay = (currentDelay * factor).toLong().coerceAtMost(maxDelay)
        }
        return block()
    }

    fun getStyleById(styleId: String): Style? {
        return _cachedStyles.value[styleId]
    }
    suspend fun loadStyleById(styleId: String): Result<Style> = withContext(Dispatchers.IO) {
        retryIO {
            try {
                val originalToken = tokenStorage.getAccessToken()
                val response = apiService.getStyle(originalToken?.let { "Bearer $it" }, styleId)
                val style = response.body()?.style
                if (response.isSuccessful && style != null && style.id == styleId) {
                    val currentToken = tokenStorage.getAccessToken()
                    val sameSession = com.itsdhruvbhardwaj.picme.notifications.PushSession.fromToken(originalToken) ==
                        com.itsdhruvbhardwaj.picme.notifications.PushSession.fromToken(currentToken) && (originalToken == null) == (currentToken == null)
                    val safeStyle = if (sameSession) style else style.copy(isFavorite = false)
                    _cachedStyles.update { it + (safeStyle.id to safeStyle) }; Result.success(safeStyle)
                } else {
                    if (response.code() == 404) _cachedStyles.update { it - styleId }
                    Result.failure(Exception(when (response.code()) {
                        404 -> "This style is no longer available."
                        429, 500, 502, 503, 504 -> "server_overloaded"
                        else -> "Couldn't load this style. Please try again."
                    }))
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: IOException) { Result.failure(Exception("network_error")) }
        }
    }
}
