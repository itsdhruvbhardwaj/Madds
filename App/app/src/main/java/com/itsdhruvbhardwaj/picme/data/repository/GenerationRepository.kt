package com.itsdhruvbhardwaj.picme.data.repository

import android.content.ContentResolver
import android.net.Uri
import com.google.gson.Gson
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.ErrorResponse
import com.itsdhruvbhardwaj.picme.data.model.GenerationResponse
import com.itsdhruvbhardwaj.picme.data.model.InsufficientCreditsResponse
import com.itsdhruvbhardwaj.picme.data.remote.StyleApiService
import com.itsdhruvbhardwaj.picme.utils.FileUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.net.SocketTimeoutException

/**
 * Exceptions for specific generation failure cases.
 */
class InsufficientCreditsException(val required: Int, val available: Int, message: String) : Exception(message)
class DuplicateOperationException(message: String) : Exception(message)
class AmbiguousOutcomeException(message: String) : Exception(message)

/**
 * Repository responsible for handling image generation requests.
 */
class GenerationRepository(
    private val apiService: StyleApiService,
    private val contentResolver: ContentResolver,
    private val tokenStorage: AuthTokenStorage
) {

    /**
     * Sends a request to the backend to generate an image using the selected style and photos.
     */
    suspend fun generateImage(
        styleId: String,
        imageUris: List<Uri>,
        idempotencyKey: String
    ): Result<GenerationResponse> = withContext(Dispatchers.IO) {
        val styleIdBody = styleId.toRequestBody("text/plain".toMediaTypeOrNull())
        executeGeneration(idempotencyKey) { auth, key ->
            val imageParts = imageUris.mapNotNull { uri ->
                FileUtils.uriToMultipartPart(contentResolver, uri, "images")
            }
            if (imageParts.size != imageUris.size) throw Exception("Failed to process images")
            
            apiService.generateImage(auth, key, styleIdBody, imageParts)
        }
    }

    /**
     * Sends a request to generate an image from a custom text prompt.
     */
    suspend fun generateCustomImage(
        prompt: String,
        imageUris: List<Uri>,
        idempotencyKey: String
    ): Result<GenerationResponse> = withContext(Dispatchers.IO) {
        val promptBody = prompt.toRequestBody("text/plain".toMediaTypeOrNull())
        executeGeneration(idempotencyKey) { auth, key ->
            val imageParts = imageUris.mapNotNull { uri ->
                FileUtils.uriToMultipartPart(contentResolver, uri, "images")
            }
            apiService.generateCustomImage(auth, key, promptBody, imageParts)
        }
    }

    private suspend fun executeGeneration(
        idempotencyKey: String,
        call: suspend (auth: String, key: String) -> retrofit2.Response<GenerationResponse>
    ): Result<GenerationResponse> {
        try {
            val accessToken = tokenStorage.getAccessToken()
                ?: return Result.failure(Exception("401 Unauthorized"))

            val response = call("Bearer $accessToken", idempotencyKey)

            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                return if (body.ok) Result.success(body) else Result.failure(Exception(body.message))
            } else {
                val errorCode = response.code()
                val errorBodyString = response.errorBody()?.string() ?: ""
                
                return when (errorCode) {
                    402 -> {
                        val details = try { Gson().fromJson(errorBodyString, InsufficientCreditsResponse::class.java) } catch (e: Exception) { null }
                        if (details != null) Result.failure(InsufficientCreditsException(details.requiredCredits, details.availableCredits, details.error))
                        else Result.failure(Exception("Insufficient credits"))
                    }
                    409 -> Result.failure(DuplicateOperationException("Duplicate request"))
                    400 -> {
                        if (errorBodyString.contains("TOO_MANY_IMAGES")) Result.failure(Exception("Please select at most 2 images for custom generation."))
                        else Result.failure(Exception("Invalid request: $errorBodyString"))
                    }
                    else -> Result.failure(Exception("Error $errorCode"))
                }
            }
        } catch (e: SocketTimeoutException) {
            return Result.failure(AmbiguousOutcomeException("Timeout"))
        } catch (e: IOException) {
            return Result.failure(AmbiguousOutcomeException("Network error"))
        } catch (e: Exception) {
            return Result.failure(e)
        }
    }
}
