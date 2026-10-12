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
     * Includes authentication and idempotency headers.
     *
     * @param styleId The ID of the style to apply.
     * @param imageUris List of Android content URIs for the input images.
     * @param idempotencyKey A unique key for this generation attempt to prevent duplicate charges.
     * @return A Result containing the [GenerationResponse] on success or a specific exception on failure.
     */
    suspend fun generateImage(
        styleId: String,
        imageUris: List<Uri>,
        idempotencyKey: String
    ): Result<GenerationResponse> = withContext(Dispatchers.IO) {
        try {
            val accessToken = tokenStorage.getAccessToken()
                ?: return@withContext Result.failure(Exception("401 Unauthorized: No access token"))

            if (imageUris.isEmpty()) {
                return@withContext Result.failure(Exception("No images selected"))
            }

            val styleIdBody = styleId.toRequestBody("text/plain".toMediaTypeOrNull())
            val imageParts = imageUris.mapNotNull { uri ->
                FileUtils.uriToMultipartPart(contentResolver, uri, "images")
            }

            if (imageParts.size != imageUris.size) {
                return@withContext Result.failure(Exception("Failed to process some images. Please check if they are accessible."))
            }

            val response = apiService.generateImage(
                authorization = "Bearer $accessToken",
                idempotencyKey = idempotencyKey,
                styleId = styleIdBody,
                images = imageParts
            )

            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.ok) {
                    Result.success(body)
                } else {
                    Result.failure(Exception(body.message ?: "Generation failed"))
                }
            } else {
                val errorCode = response.code()
                val errorBodyString = response.errorBody()?.string() ?: ""
                
                when (errorCode) {
                    402 -> {
                        val details = try {
                            Gson().fromJson(errorBodyString, InsufficientCreditsResponse::class.java)
                        } catch (e: Exception) { null }
                        
                        if (details != null) {
                            Result.failure(InsufficientCreditsException(details.requiredCredits, details.availableCredits, details.error))
                        } else {
                            Result.failure(Exception("Insufficient credits for this style."))
                        }
                    }
                    409 -> {
                        Result.failure(DuplicateOperationException("This request was already processed or is currently pending. Please wait or check your history."))
                    }
                    else -> {
                        val serverMessage = try {
                            Gson().fromJson(errorBodyString, ErrorResponse::class.java).message
                        } catch (e: Exception) { null } ?: "Server error during generation"
                        Result.failure(Exception("API Error $errorCode: $serverMessage"))
                    }
                }
            }
        } catch (e: SocketTimeoutException) {
            // Ambiguous outcome: request might have reached server but response didn't come back
            Result.failure(AmbiguousOutcomeException("Connection timed out. We couldn't confirm if your generation started. Please check your history before trying again."))
        } catch (e: IOException) {
            // Ambiguous outcome if it happened during the request
            Result.failure(AmbiguousOutcomeException("Network failure. The status of your generation is unconfirmed. Please wait a moment before retrying."))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
