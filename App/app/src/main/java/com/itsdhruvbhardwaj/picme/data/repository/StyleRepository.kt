package com.itsdhruvbhardwaj.picme.data.repository

import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.HomeConfigResponse
import com.itsdhruvbhardwaj.picme.data.model.StyleCollection
import com.itsdhruvbhardwaj.picme.data.model.Style
import com.itsdhruvbhardwaj.picme.data.model.StyleResponse
import com.itsdhruvbhardwaj.picme.data.remote.StyleApiService
import kotlinx.coroutines.Dispatchers
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
    private val tokenStorage: AuthTokenStorage
) {
    private val _cachedStyles = MutableStateFlow<Map<String, Style>>(emptyMap())
    val cachedStyles: StateFlow<Map<String, Style>> = _cachedStyles.asStateFlow()

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
                val response = apiService.getStyles(authHeader, page, limit, collection, search, trendingFirst)
                
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
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getHomeConfig(): Result<HomeConfigResponse> = withContext(Dispatchers.IO) {
        retryIO {
            try {
                val response = apiService.getHomeConfig()
                if (response.isSuccessful && response.body() != null) {
                    Result.success(response.body()!!)
                } else {
                    Result.failure(Exception("failed_to_load_config"))
                }
            } catch (e: SocketTimeoutException) {
                Result.failure(Exception("timeout"))
            } catch (e: IOException) {
                Result.failure(Exception("network_error"))
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    suspend fun getCollections(): Result<List<StyleCollection>> = withContext(Dispatchers.IO) {
        retryIO {
            try {
                val response = apiService.getCollections()
                if (response.isSuccessful && response.body() != null) {
                    Result.success(response.body()!!.collections)
                } else {
                    // Older Render deployments may not yet expose /api/collections.
                    // Build a usable list from the public styles API while that deploy catches up.
                    val fallback = getCollectionsFromStyles()
                    if (fallback.isSuccess) fallback
                    else Result.failure(Exception("failed_to_load_collections_http_${response.code()}"))
                }
            } catch (e: SocketTimeoutException) {
                Result.failure(Exception("timeout"))
            } catch (e: IOException) {
                Result.failure(Exception("network_error"))
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
    }

    private suspend fun getCollectionsFromStyles(): Result<List<StyleCollection>> {
        val names = linkedSetOf<String>()
        var page = 1
        var hasMore = true

        while (hasMore && page <= 100) {
            val result = getStyles(page = page, limit = 50)
            if (result.isFailure) return Result.failure(result.exceptionOrNull()!!)
            val response = result.getOrThrow()
            response.styles.flatMapTo(names) { it.collections }
            hasMore = response.pagination.hasNextPage
            page++
        }

        return Result.success(
            names.sortedBy { it.lowercase() }.map { name ->
                StyleCollection(
                    id = name.lowercase().trim().replace(Regex("[^a-z0-9]+"), "-").trim('-'),
                    name = name
                )
            }
        )
    }

    private suspend fun <T> retryIO(
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
}
