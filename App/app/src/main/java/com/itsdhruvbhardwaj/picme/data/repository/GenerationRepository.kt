package com.itsdhruvbhardwaj.picme.data.repository

import android.content.ContentResolver
import android.net.Uri
import com.google.gson.Gson
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.ErrorResponse
import com.itsdhruvbhardwaj.picme.data.model.GenerationResponse
import com.itsdhruvbhardwaj.picme.data.model.InsufficientCreditsResponse
import com.itsdhruvbhardwaj.picme.data.remote.StyleApiService
import com.itsdhruvbhardwaj.picme.utils.GenerationPhotoProcessor
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
    private val tokenStorage: AuthTokenStorage,
    private val galleryApiService: StyleApiService = apiService,
    private val galleryStore: com.itsdhruvbhardwaj.picme.data.local.GenerationGalleryStore? = null,
    private val preparePhoto: (ContentResolver, Uri, String) -> okhttp3.MultipartBody.Part = GenerationPhotoProcessor::multipart
) {
    fun accountId(): String? = tokenStorage.getUser()?.id
    fun pendingSince(owner: String, key: String): Long = tokenStorage.pendingGenerationSince(owner, key)
    fun pendingKeys(owner: String): Set<String> = tokenStorage.pendingGenerationKeys(owner)
    fun rememberPending(owner: String, key: String): Boolean = tokenStorage.savePendingGenerationKeys(owner, pendingKeys(owner) + key)
    fun forgetPending(owner: String, key: String) { tokenStorage.savePendingGenerationKeys(owner, pendingKeys(owner) - key) }
    private fun authorization() = "Bearer ${tokenStorage.getAccessToken() ?: throw IOException("Signed out") }"
    suspend fun operations() = apiService.generationOperations(authorization())
    suspend fun operationByKey(key: String) = apiService.generationByKey(authorization(), key)
    suspend fun result(id: String) = apiService.generationResult(authorization(), id)
    suspend fun viewed(id: String) = apiService.generationViewed(authorization(), id)
    fun bindGallery(owner: String?) { galleryStore?.bind(owner) }
    suspend fun gallery(cursor: String?) = galleryApiService.generationGallery(authorization(), cursor)
    suspend fun details(id: String) = galleryApiService.generationDetails(authorization(), id)
    suspend fun deleteResult(id: String) = galleryApiService.deleteGenerationResult(authorization(), id)
    suspend fun savedUri(owner: String, id: String): Uri? = withContext(Dispatchers.IO) {
        galleryStore?.savedUri(owner, id)?.takeIf { uri ->
            runCatching { contentResolver.openInputStream(uri)?.use { true } ?: false }.getOrDefault(false)
                .also { exists -> if (!exists) galleryStore.forgetSaved(owner, id) }
        }
    }
    fun rememberSaved(owner: String, id: String, uri: Uri) { galleryStore?.rememberSaved(owner, id, uri) }
    fun forgetSaved(owner: String, id: String) { galleryStore?.forgetSaved(owner, id) }
    fun forgetThumbnail(owner: String, id: String) { galleryStore?.forgetThumbnail(owner, id) }
    suspend fun thumbnail(owner: String, id: String, expires: Long): java.io.File? = withContext(Dispatchers.IO) {
        galleryStore?.thumbnail(owner, id, expires)?.let { return@withContext it }
        val response = galleryApiService.generationThumbnail(authorization(), id)
        if (!response.isSuccessful) { response.errorBody()?.close(); return@withContext null }
        response.body()?.use { body ->
            val bytes = body.byteStream().use { input ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (output.size() <= 512 * 1024) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    output.write(buffer, 0, count)
                }
                output.toByteArray()
            }
            galleryStore?.putThumbnail(owner, id, expires, bytes)
        }
    }

    /**
     * Sends a request to the backend to generate an image using the selected style and photos.
     */
    suspend fun generateImage(
        styleId: String,
        imageUris: List<Uri>,
        idempotencyKey: String
    ): Result<GenerationResponse> = withContext(Dispatchers.IO) {
        val styleIdBody = styleId.toRequestBody("text/plain".toMediaTypeOrNull())
        if (imageUris.isEmpty()) return@withContext Result.failure(Exception("No images selected"))
        executeGeneration(idempotencyKey) { auth, key ->
            val imageParts = imageUris.map { uri ->
                preparePhoto(contentResolver, uri, "images")
            }
            if (imageParts.size != imageUris.size) throw Exception("Failed to process images")
            
            apiService.generateImage(auth, key, styleIdBody, imageParts)
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
                    409 -> {
                        val details = runCatching { Gson().fromJson(errorBodyString, GenerationResponse::class.java) }.getOrNull()
                        if (details?.generationId != null) Result.success(GenerationResponse(true, generationId = details.generationId, status = details.status ?: "processing"))
                        else Result.failure(DuplicateOperationException("Duplicate request"))
                    }
                    400 -> {
                        if (errorBodyString.contains("TOO_MANY_IMAGES")) Result.failure(Exception("Too many photos selected for this style."))
                        else Result.failure(Exception("Invalid request: $errorBodyString"))
                    }
                    else -> Result.failure(AmbiguousOutcomeException("The request status needs to be checked. No new generation will be started."))
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
