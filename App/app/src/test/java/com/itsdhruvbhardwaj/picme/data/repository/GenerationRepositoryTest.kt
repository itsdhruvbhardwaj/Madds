package com.itsdhruvbhardwaj.picme.data.repository

import android.content.ContentResolver
import android.net.Uri
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.remote.StyleApiService
import kotlinx.coroutines.runBlocking
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.Mock
import org.mockito.Mockito.`when`
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import retrofit2.Response
import java.net.SocketTimeoutException

class GenerationRepositoryTest {

    @Mock
    private lateinit var apiService: StyleApiService

    @Mock
    private lateinit var contentResolver: ContentResolver
    
    @Mock
    private lateinit var tokenStorage: AuthTokenStorage

    private lateinit var repository: GenerationRepository

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        repository = GenerationRepository(apiService, contentResolver, tokenStorage)
    }

    @Test
    fun `generateImage with empty URIs returns failure`() = runBlocking {
        `when`(tokenStorage.getAccessToken()).thenReturn("test-token")
        val result = repository.generateImage("style1", emptyList(), "test-key")
        assertTrue(result.isFailure)
        assertEquals("No images selected", result.exceptionOrNull()?.message)
    }

    @Test
    fun `generateImage with no token returns failure`() = runBlocking {
        `when`(tokenStorage.getAccessToken()).thenReturn(null)
        val mockUri: Uri = mock()
        val result = repository.generateImage("style1", listOf(mockUri), "test-key")
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("401") == true)
    }

    @Test
    fun `generateImage with 402 returns InsufficientCreditsException`() = runBlocking {
        `when`(tokenStorage.getAccessToken()).thenReturn("token")
        val mockUri: Uri = mock()
        
        // Mock ContentResolver to satisfy FileUtils.uriToMultipartPart
        `when`(contentResolver.getType(any())).thenReturn("image/jpeg")
        
        val errorJson = "{\"ok\":false, \"code\":\"INSUFFICIENT_CREDITS\", \"error\":\"Not enough credits.\", \"requiredCredits\":10, \"availableCredits\":4}"
        val errorResponseBody = errorJson.toResponseBody("application/json".toMediaTypeOrNull())
        
        `when`(apiService.generateImage(any(), any(), any(), any())).thenReturn(
            Response.error(402, errorResponseBody)
        )

        val result = repository.generateImage("style1", listOf(mockUri), "key")
        
        assertTrue("Expected failure", result.isFailure)
        val exception = result.exceptionOrNull()
        assertTrue("Expected InsufficientCreditsException but got $exception", exception is InsufficientCreditsException)
        val creditsException = exception as InsufficientCreditsException
        assertEquals(10, creditsException.required)
        assertEquals(4, creditsException.available)
    }

    @Test
    fun `generateImage with 409 returns DuplicateOperationException`() = runBlocking {
        `when`(tokenStorage.getAccessToken()).thenReturn("token")
        val mockUri: Uri = mock()
        `when`(contentResolver.getType(any())).thenReturn("image/jpeg")
        
        val errorResponseBody = "{\"ok\":false, \"message\":\"Duplicate\"}".toResponseBody("application/json".toMediaTypeOrNull())
        
        `when`(apiService.generateImage(any(), any(), any(), any())).thenReturn(
            Response.error(409, errorResponseBody)
        )

        val result = repository.generateImage("style1", listOf(mockUri), "key")
        
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is DuplicateOperationException)
    }

    @Test
    fun `generateImage with SocketTimeoutException returns AmbiguousOutcomeException`() = runBlocking {
        `when`(tokenStorage.getAccessToken()).thenReturn("token")
        val mockUri: Uri = mock()
        `when`(contentResolver.getType(any())).thenReturn("image/jpeg")
        
        `when`(apiService.generateImage(any(), any(), any(), any())).thenAnswer {
            throw SocketTimeoutException("Timeout")
        }

        val result = repository.generateImage("style1", listOf(mockUri), "key")
        
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull() is AmbiguousOutcomeException)
    }
}
