package com.itsdhruvbhardwaj.picme.data.repository

import android.content.ContentResolver
import android.net.Uri
import com.itsdhruvbhardwaj.picme.data.model.GenerationResponse
import com.itsdhruvbhardwaj.picme.data.remote.StyleApiService
import com.itsdhruvbhardwaj.picme.utils.FileUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException

/**
 * Repository responsible for handling image generation requests.
 *
 * @property apiService The API service for style and generation related calls.
 * @property contentResolver ContentResolver to read images from URIs.
 */
class GenerationRepository(
    private val apiService: StyleApiService,
    private val contentResolver: ContentResolver
) {

    /**
     * Sends a request to the backend to generate an image using the selected style and photos.
     *
     * @param styleId The ID of the style to apply.
     * @param imageUris List of Android content URIs for the input images.
     * @return A Result containing the [GenerationResponse] on success or an error on failure.
     */
    suspend fun generateImage(
        styleId: String,
        imageUris: List<Uri>
    ): Result<GenerationResponse> = withContext(Dispatchers.IO) {
        try {
            if (imageUris.isEmpty()) {
                return@withContext Result.failure(Exception("No images selected"))
            }

            // Convert styleId to RequestBody
            val styleIdBody = styleId.toRequestBody("text/plain".toMediaTypeOrNull())

            // Convert all URIs to MultipartBody.Part
            val imageParts = imageUris.mapNotNull { uri ->
                FileUtils.uriToMultipartPart(contentResolver, uri, "images")
            }

            if (imageParts.size != imageUris.size) {
                return@withContext Result.failure(Exception("Failed to process some images"))
            }

            val response = apiService.generateImage(styleIdBody, imageParts)

            if (response.isSuccessful && response.body() != null) {
                val body = response.body()!!
                if (body.ok) {
                    Result.success(body)
                } else {
                    Result.failure(Exception(body.message ?: "Generation failed"))
                }
            } else {
                val errorMessage = response.errorBody()?.string() ?: "Generation request failed"
                Result.failure(Exception("API Error ${response.code()}: $errorMessage"))
            }
        } catch (e: IOException) {
            Result.failure(Exception("Network error: Check your connection"))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
