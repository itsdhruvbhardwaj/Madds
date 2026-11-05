package com.itsdhruvbhardwaj.picme.ui.screens.create

import android.net.Uri
import com.itsdhruvbhardwaj.picme.data.model.GenerationResponse
import com.itsdhruvbhardwaj.picme.data.repository.GenerationRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.Mock
import org.mockito.Mockito.`when`
import org.mockito.MockitoAnnotations
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import org.mockito.kotlin.doSuspendableAnswer
import org.mockito.kotlin.verify
import org.mockito.kotlin.times
import org.mockito.kotlin.never
import kotlinx.coroutines.CompletableDeferred
import com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration
import com.itsdhruvbhardwaj.picme.data.model.GenerationOperationsResponse
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class GenerationViewModelTest {
    @Test fun `unknown outcome explains cause and can be acknowledged without another generation`() = runTest {
        whenever(repository.operations()).thenReturn(Response.success(GenerationOperationsResponse(listOf(
            RecoverableGeneration("operation", status = "outcome_unknown", failureReason = "Provider timed out")
        ))))
        whenever(repository.viewed("operation")).thenReturn(Response.success(Unit))
        viewModel.openOperation("operation")
        advanceUntilIdle()
        val error = viewModel.uiState.value as GenerationUiState.Error
        assertTrue(error.message.contains("Provider timed out"))
        assertTrue(error.isAmbiguous)
        viewModel.markFocusedViewed()
        advanceUntilIdle()
        assertTrue(viewModel.operations.value.isEmpty())
        verify(repository, never()).generateImage(any(), any(), any())
    }

    @Test fun `unavailable result becomes a recoverable error instead of an endless spinner`() = runTest {
        whenever(repository.operations()).thenReturn(Response.success(GenerationOperationsResponse(listOf(
            RecoverableGeneration("operation", status = "completed", resultAvailable = true)
        ))))
        whenever(repository.result("operation")).thenReturn(Response.error(503,
            okhttp3.ResponseBody.create(null, "temporarily unavailable")))
        viewModel.openOperation("operation")
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value is GenerationUiState.Error)
        viewModel.markFocusedViewed()
        advanceUntilIdle()
        verify(repository, never()).viewed(any())
        verify(repository, never()).generateImage(any(), any(), any())
    }

    @Test fun `network failure while retrieving result stops the spinner and preserves recovery`() = runTest {
        whenever(repository.operations()).thenReturn(Response.success(GenerationOperationsResponse(listOf(
            RecoverableGeneration("operation", status = "completed", resultAvailable = true)
        ))))
        whenever(repository.result("operation")).doSuspendableAnswer { throw java.io.IOException("offline") }
        viewModel.openOperation("operation")
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value is GenerationUiState.Error)
        assertEquals("operation", viewModel.operations.value.single().id)
        verify(repository, never()).generateImage(any(), any(), any())
    }

    @Test fun `confirmed missing submission ages out without making another paid request`() = runTest {
        var key = ""
        whenever(repository.rememberPending(any(), any())).thenAnswer { key = it.getArgument(1); true }
        whenever(repository.pendingKeys(any())).thenAnswer { setOf(key) }
        whenever(repository.pendingSince(any(), any())).thenReturn(System.currentTimeMillis() - 360_000)
        whenever(repository.operationByKey(any())).thenReturn(Response.error(404, okhttp3.ResponseBody.create(null, "Not found")))
        whenever(repository.generateImage(any(), any(), any())).thenReturn(Result.failure(
            com.itsdhruvbhardwaj.picme.data.repository.AmbiguousOutcomeException("connection lost")))
        viewModel.setSelectedPhotos(listOf(mock()))
        viewModel.generateImage("style")
        advanceUntilIdle()
        viewModel.refreshOperations()
        assertTrue(viewModel.operations.value.isEmpty())
        assertTrue(viewModel.uiState.value is GenerationUiState.Error)
        verify(repository).forgetPending("owner", key)
        verify(repository, times(1)).generateImage(any(), any(), any())
    }

    @Test fun `completed status waits for result download and never submits again`() = runTest {
        val download = CompletableDeferred<Response<GenerationResponse>>()
        whenever(repository.operations()).thenReturn(Response.success(GenerationOperationsResponse(listOf(
            RecoverableGeneration("operation", status = "completed", resultAvailable = true)
        ))))
        whenever(repository.result("operation")).doSuspendableAnswer { download.await() }
        viewModel.openOperation("operation")
        runCurrent()
        assertTrue(viewModel.uiState.value is GenerationUiState.Processing)
        assertEquals("operation", viewModel.focusedGenerationId.value)
        verify(repository, never()).viewed(any())
        download.complete(Response.success(GenerationResponse(true, image = "downloaded-photo")))
        advanceUntilIdle()
        assertEquals("downloaded-photo", (viewModel.uiState.value as GenerationUiState.Success).imageBase64)
        verify(repository, never()).generateImage(any(), any(), any())
        verify(repository, never()).viewed(any())
    }

    @Test fun `late display callback cannot acknowledge a different focused generation`() = runTest {
        whenever(repository.operations()).thenReturn(Response.success(GenerationOperationsResponse(listOf(
            RecoverableGeneration("operation", status = "processing")
        ))))
        viewModel.openOperation("operation")
        advanceUntilIdle()
        viewModel.markFocusedViewed("old-operation")
        advanceUntilIdle()
        verify(repository, never()).viewed(any())
    }

    @Test fun `safety rejection politely explains alternatives without resubmitting`() = runTest {
        whenever(repository.operations()).thenReturn(Response.success(GenerationOperationsResponse(listOf(
            RecoverableGeneration("operation", status = "failed", failureReason = "The provider rejected the request under its content policy.")
        ))))
        viewModel.openOperation("operation")
        advanceUntilIdle()
        val error = viewModel.uiState.value as GenerationUiState.Error
        assertTrue(error.message.contains("safety checks"))
        assertTrue(error.message.contains("credits have been refunded"))
        assertTrue(error.message.contains("style prompt, or their combination"))
        assertTrue(error.message.contains("clear, well-lit photograph"))
        assertTrue(!error.canRetryWithNewKey)
        verify(repository, never()).generateImage(any(), any(), any())
        verify(repository, never()).generateCustomImage(any(), any(), any())
    }

    @Test fun `server insufficient credits exposes the shared top-up request without retrying generation`() = runTest {
        viewModel.setSelectedPhotos(listOf(mock()))
        whenever(repository.generateImage(any(), any(), any())).thenReturn(Result.failure(
            com.itsdhruvbhardwaj.picme.data.repository.InsufficientCreditsException(10, 0, "Not enough credits")))
        viewModel.generateImage("style")
        advanceUntilIdle()
        val error = viewModel.uiState.value as GenerationUiState.Error
        assertEquals(10, error.requiredCredits)
        assertEquals(0, error.availableCredits)
        assertTrue(!error.canRetryWithNewKey)
        assertTrue(viewModel.operations.value.isEmpty())
        verify(repository, times(1)).generateImage(any(), any(), any())
    }

    @Mock
    private lateinit var repository: GenerationRepository
    
    private lateinit var viewModel: GenerationViewModel
    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        Dispatchers.setMain(testDispatcher)
        `when`(repository.accountId()).thenReturn("owner")
        `when`(repository.rememberPending(any(), any())).thenReturn(true)
        `when`(repository.pendingKeys(any())).thenReturn(emptySet())
        runTest { `when`(repository.operations()).thenReturn(retrofit2.Response.success(com.itsdhruvbhardwaj.picme.data.model.GenerationOperationsResponse(emptyList()))) }
        viewModel = GenerationViewModel(repository)
        viewModel.bindAccount("owner")
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `rapid generate taps submit only once and uploading is synchronous`() = runTest {
        val photo: Uri = mock()
        viewModel.setSelectedPhotos(listOf(photo))
        whenever(repository.generateImage(any(), any(), any())).thenReturn(Result.success(GenerationResponse(true, image = "photo")))
        viewModel.generateImage("style")
        assertTrue(viewModel.uiState.value is GenerationUiState.Uploading)
        viewModel.generateImage("style")
        advanceUntilIdle()
        verify(repository, times(1)).generateImage(any(), any(), any())
    }

    @Test
    fun `a late response cannot replace a different generation`() = runTest {
        viewModel.setSelectedPhotos(listOf(mock()))
        val old = CompletableDeferred<Result<GenerationResponse>>()
        whenever(repository.generateImage(any(), any(), any())).doSuspendableAnswer { old.await() }
        viewModel.generateImage("old-style")
        runCurrent()
        viewModel.resetState()
        whenever(repository.generateImage(any(), any(), any())).thenReturn(Result.success(GenerationResponse(true, image = "new-photo")))
        viewModel.generateImage("new-style")
        runCurrent()
        old.complete(Result.success(GenerationResponse(true, image = "old-photo")))
        advanceUntilIdle()
        assertEquals("new-photo", (viewModel.uiState.value as GenerationUiState.Success).imageBase64)
    }

    @Test
    fun `recovering a ready operation retrieves the result without a paid submission`() = runTest {
        whenever(repository.operations()).thenReturn(Response.success(GenerationOperationsResponse(listOf(
            RecoverableGeneration("operation", status = "completed", resultAvailable = true)
        ))))
        whenever(repository.result("operation")).thenReturn(Response.success(GenerationResponse(true, image = "recovered-photo")))
        viewModel.openOperation("operation")
        advanceUntilIdle()
        assertEquals("recovered-photo", (viewModel.uiState.value as GenerationUiState.Success).imageBase64)
        verify(repository, never()).generateImage(any(), any(), any())
    }

    @Test
    fun `leaving the screen keeps accepted work in the recovery list`() = runTest {
        viewModel.setSelectedPhotos(listOf(mock()))
        whenever(repository.generateImage(any(), any(), any())).thenReturn(Result.success(GenerationResponse(true, generationId = "operation", status = "processing")))
        whenever(repository.operations()).thenReturn(Response.success(GenerationOperationsResponse(listOf(RecoverableGeneration("operation")))))
        viewModel.generateImage("style")
        advanceUntilIdle()
        viewModel.resetState()
        assertTrue(viewModel.uiState.value is GenerationUiState.Idle)
        assertEquals("operation", viewModel.operations.value.single().id)
    }

    @Test
    fun `switching accounts clears the previous accounts visible operations`() = runTest {
        whenever(repository.operations()).thenReturn(Response.success(GenerationOperationsResponse(listOf(RecoverableGeneration("private-operation")))))
        viewModel.refreshOperations()
        assertEquals(1, viewModel.operations.value.size)
        viewModel.bindAccount("different-owner")
        assertTrue(viewModel.operations.value.isEmpty())
        assertTrue(viewModel.uiState.value is GenerationUiState.Idle)
    }

    @Test
    fun `generateImage success updates state to Success after processing`() = runTest {
        // Arrange
        val mockUri: Uri = mock()
        viewModel.setSelectedPhotos(listOf(mockUri))
        `when`(repository.generateImage(any(), any(), any())).thenReturn(
            Result.success(GenerationResponse(ok = true, image = "base64data"))
        )

        // Act
        viewModel.generateImage("style1")
        
        // Advance time to pass the initial delay and processing
        advanceUntilIdle()

        // Assert
        assertTrue(viewModel.uiState.value is GenerationUiState.Success)
        assertEquals("base64data", (viewModel.uiState.value as GenerationUiState.Success).imageBase64)
    }

    @Test
    fun `generateImage failure updates state to Error`() = runTest {
        // Arrange
        val mockUri: Uri = mock()
        viewModel.setSelectedPhotos(listOf(mockUri))
        `when`(repository.generateImage(any(), any(), any())).thenReturn(
            Result.failure(Exception("API Error 500"))
        )

        // Act
        viewModel.generateImage("style1")
        advanceUntilIdle()

        // Assert
        assertTrue(viewModel.uiState.value is GenerationUiState.Error)
        assertEquals("API Error 500", (viewModel.uiState.value as GenerationUiState.Error).message)
    }

    @Test
    fun `generateImage with no photos updates state to Error`() = runTest {
        // Act
        viewModel.generateImage("style1")
        advanceUntilIdle()

        // Assert
        assertTrue(viewModel.uiState.value is GenerationUiState.Error)
        assertTrue((viewModel.uiState.value as GenerationUiState.Error).message.contains("No photos selected"))
    }
}
