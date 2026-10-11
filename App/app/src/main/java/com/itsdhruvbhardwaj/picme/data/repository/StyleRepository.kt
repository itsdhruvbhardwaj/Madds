package com.itsdhruvbhardwaj.picme.data.repository

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
import retrofit2.Response
import java.io.IOException
import java.net.SocketTimeoutException

class StyleRepository(
    private val apiService: StyleApiService
) {
    // Cache to store styles that have been fetched
    private val _cachedStyles = MutableStateFlow<Map<String, Style>>(emptyMap())
    val cachedStyles: StateFlow<Map<String, Style>> = _cachedStyles.asStateFlow()

    suspend fun getStyles(
        page: Int,
        limit: Int,
        category: String? = null
    ): Result<StyleResponse> = withContext(Dispatchers.IO) {
        retryIO {
            try {
                val response = apiService.getStyles(page, limit, category)
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    // Update cache with new styles
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

    private suspend fun <T> retryIO(
        times: Int = 3,
        initialDelay: Long = 1000, // 1 second
        maxDelay: Long = 5000,    // 5 seconds
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
        return block() // final attempt
    }

    fun getStyleById(styleId: String): Style? {
        return _cachedStyles.value[styleId]
    }
}
