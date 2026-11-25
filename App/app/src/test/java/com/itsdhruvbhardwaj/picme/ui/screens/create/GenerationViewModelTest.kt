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
import kotlinx.coroutines.async
import kotlinx.coroutines.CompletableDeferred
import com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration
import com.itsdhruvbhardwaj.picme.data.model.GenerationOperationsResponse
import retrofit2.Response

@OptIn(ExperimentalCoroutinesApi::class)
class GenerationViewModelTest {
    @Test fun `discard removes only the viewed result and does not resubmit generation`() = runTest {
        val first = RecoverableGeneration("operation", status = "completed", resultAvailable = true)
        val second = RecoverableGeneration("other", status = "processing")
        whenever(repository.operations()).thenReturn(Response.success(GenerationOperationsResponse(listOf(first, second))))
        whenever(repository.result("operation")).thenReturn(Response.success(GenerationResponse(true, image = "photo")))
        whenever(repository.viewed("operation")).thenReturn(Response.error(503, okhttp3.ResponseBody.create(null, "offline")))
        viewModel.openOperation("operation")
        advanceUntilIdle()
        viewModel.discardFocusedResult("stale-result")
        assertEquals(2, viewModel.operations.value.size)
        viewModel.discardFocusedResult("operation")
        advanceUntilIdle()
        viewModel.refreshOperations()
        assertEquals(listOf("other"), viewModel.operations.value.map { it.id })
        verify(repository, never()).generateImage(any(), any(), any())
    }

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

    @Test fun `viewing a recent photo clears the header but keeps the gallery and does not generate again`() = runTest {
        val photo = RecoverableGeneration("operation", status = "completed", resultAvailable = true, resultExpiresAt = "2030-01-01T00:00:00.000Z")
        whenever(repository.gallery(null)).thenReturn(Response.success(com.itsdhruvbhardwaj.picme.data.model.GenerationGalleryResponse(listOf(photo))))
        whenever(repository.details("operation")).thenReturn(Response.success(photo))
        whenever(repository.operations()).thenReturn(Response.success(GenerationOperationsResponse(listOf(photo))))
        whenever(repository.result("operation")).thenReturn(Response.success(GenerationResponse(true, "photo", resultExpiresAt = photo.resultExpiresAt)))
        whenever(repository.viewed("operation")).thenReturn(Response.success(Unit))
        viewModel.refreshGallery(); advanceUntilIdle()
        viewModel.openOperation("operation"); advanceUntilIdle()
        viewModel.markFocusedViewed(); advanceUntilIdle()
        assertTrue(viewModel.operations.value.isEmpty())
        assertEquals("operation", viewModel.gallery.value.items.single().id)
        assertTrue(viewModel.focusedExpiry.value != null)
        viewModel.resetState()
        assertEquals("operation", viewModel.gallery.value.items.single().id)
        verify(repository, never()).generateImage(any(), any(), any())
        verify(repository, never()).deleteResult(any())
    }

    @Test fun `gallery cursor appends without duplicating an existing generation`() = runTest {
        val first = RecoverableGeneration("one", status = "processing")
        val second = RecoverableGeneration("two", status = "processing")
        whenever(repository.gallery(null)).thenReturn(Response.success(com.itsdhruvbhardwaj.picme.data.model.GenerationGalleryResponse(listOf(first), "cursor")))
        whenever(repository.gallery("cursor")).thenReturn(Response.success(com.itsdhruvbhardwaj.picme.data.model.GenerationGalleryResponse(listOf(first, second))))
        viewModel.refreshGallery(); advanceUntilIdle()
        viewModel.refreshGallery(loadMore = true); advanceUntilIdle()
        assertEquals(listOf("one", "two"), viewModel.gallery.value.items.map { it.id })
        assertEquals(null, viewModel.gallery.value.nextCursor)
        verify(repository, never()).generateImage(any(), any(), any())
    }

    @Test fun `gallery data cannot survive account switching or a late response`() = runTest {
        val response = CompletableDeferred<Response<com.itsdhruvbhardwaj.picme.data.model.GenerationGalleryResponse>>()
        whenever(repository.gallery(null)).doSuspendableAnswer { response.await() }
        viewModel.refreshGallery(); runCurrent()
        viewModel.bindAccount("new-owner")
        response.complete(Response.success(com.itsdhruvbhardwaj.picme.data.model.GenerationGalleryResponse(listOf(RecoverableGeneration("private-photo")))))
        advanceUntilIdle()
        assertTrue(viewModel.gallery.value.items.isEmpty())
        assertTrue(viewModel.savedResults.value.isEmpty())
        verify(repository).bindGallery("new-owner")
    }

    @Test fun `saved gallery copy prevents a second download after reopening the result`() = runTest {
        val photo = RecoverableGeneration("operation", status = "completed", resultAvailable = true, resultExpiresAt = "2030-01-01T00:00:00.000Z")
        whenever(repository.details("operation")).thenReturn(Response.success(photo))
        whenever(repository.result("operation")).thenReturn(Response.success(GenerationResponse(true, "photo", resultExpiresAt = photo.resultExpiresAt)))
        whenever(repository.savedUri("owner", "operation")).thenReturn(mock())
        viewModel.openOperation("operation"); advanceUntilIdle()
        var acknowledged = false
        val started = viewModel.saveImageToGallery(mock()) { acknowledged = it }
        assertTrue(acknowledged); assertTrue(!started)
        verify(repository, never()).generateImage(any(), any(), any())
    }

    @Test fun `expired notification opens an explicit unavailable state without a paid retry`() = runTest {
        whenever(repository.result("operation")).thenReturn(Response.error(410, okhttp3.ResponseBody.create(null, "expired")))
        viewModel.openOperation("operation"); advanceUntilIdle()
        assertTrue((viewModel.uiState.value as GenerationUiState.Error).isExpired)
        verify(repository, never()).generateImage(any(), any(), any())
    }

    @Test fun `remaining time advances from server time using the monotonic device clock`() = runTest {
        var elapsed = 1000L
        val model = GenerationViewModel(repository) { elapsed }
        model.bindAccount("owner")
        whenever(repository.gallery(null)).thenReturn(Response.success(
            com.itsdhruvbhardwaj.picme.data.model.GenerationGalleryResponse(emptyList(), serverNow = "1970-01-01T00:00:00.000Z")))
        model.refreshGallery(); advanceUntilIdle()
        assertEquals(0L, model.galleryNow())
        elapsed += 60000
        assertEquals(60000L, model.galleryNow())
    }

    @Test fun `late saved URI lookup cannot mark a photo saved for a different account`() = runTest {
        val saved = CompletableDeferred<Uri?>()
        whenever(repository.result("operation")).thenReturn(Response.success(GenerationResponse(true, "private-photo")))
        whenever(repository.savedUri("owner", "operation")).doSuspendableAnswer { saved.await() }
        viewModel.openOperation("operation"); runCurrent()
        viewModel.bindAccount("new-owner")
        saved.complete(mock()); advanceUntilIdle()
        assertTrue(viewModel.savedResults.value.isEmpty())
        assertTrue(viewModel.uiState.value is GenerationUiState.Idle)
    }

    @Test fun `completed gallery photos fetch the result directly without metadata or operation checks`() = runTest {
        val photo = RecoverableGeneration("operation", status = "completed", resultAvailable = true, resultExpiresAt = "2030-01-01T00:00:00.000Z")
        whenever(repository.result("operation")).thenReturn(Response.success(GenerationResponse(true, "full-photo")))
        viewModel.openCompletedPhoto(photo); advanceUntilIdle()
        assertEquals("full-photo", (viewModel.uiState.value as GenerationUiState.Success).imageBase64)
        assertTrue(viewModel.focusedExpiry.value != null)
        verify(repository, never()).details(any())
        verify(repository, never()).operations()
        verify(repository, never()).generateImage(any(), any(), any())
        verify(repository, never()).viewed(any())
    }

    @Test fun `a slow photo download stops with a retryable error after 45 seconds`() = runTest {
        val download = CompletableDeferred<Response<GenerationResponse>>()
        whenever(repository.result("operation")).doSuspendableAnswer { download.await() }
        viewModel.openCompletedPhoto(RecoverableGeneration("operation", status = "completed")); runCurrent()
        assertTrue(viewModel.uiState.value is GenerationUiState.Processing)
        advanceTimeBy(45_001); runCurrent()
        assertTrue((viewModel.uiState.value as GenerationUiState.Error).isAmbiguous)
        assertTrue((viewModel.uiState.value as GenerationUiState.Error).message.contains("in time"))
        verify(repository, never()).generateImage(any(), any(), any())
    }

    @Test fun `closing the photo viewer cancels retrieval and cannot restore it later`() = runTest {
        val download = CompletableDeferred<Response<GenerationResponse>>()
        whenever(repository.result("operation")).doSuspendableAnswer { download.await() }
        viewModel.openCompletedPhoto(RecoverableGeneration("operation", status = "completed")); runCurrent()
        viewModel.resetState()
        download.complete(Response.success(GenerationResponse(true, "late-photo"))); advanceUntilIdle()
        assertTrue(viewModel.uiState.value is GenerationUiState.Idle)
        assertEquals(null, viewModel.focusedGenerationId.value)
    }

    @Test fun `quickly reopening the same photo does not leave the viewer checking forever`() = runTest {
        val download = CompletableDeferred<Response<GenerationResponse>>()
        var calls = 0
        whenever(repository.result("operation")).doSuspendableAnswer {
            if (++calls == 1) kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) { download.await() }
            else Response.success(GenerationResponse(true, "new-photo"))
        }
        val photo = RecoverableGeneration("operation", status = "completed")
        viewModel.openCompletedPhoto(photo); runCurrent()
        viewModel.openCompletedPhoto(photo); runCurrent()
        assertEquals("new-photo", (viewModel.uiState.value as GenerationUiState.Success).imageBase64)
        download.complete(Response.success(GenerationResponse(true, "old-photo"))); advanceUntilIdle()
        assertEquals("new-photo", (viewModel.uiState.value as GenerationUiState.Success).imageBase64)
        verify(repository, never()).generateImage(any(), any(), any())
    }

    @Test fun `retrying a failed photo download fetches only the existing result`() = runTest {
        whenever(repository.result("operation")).thenReturn(
            Response.error(503, okhttp3.ResponseBody.create(null, "offline")),
            Response.success(GenerationResponse(true, "photo")))
        val photo = RecoverableGeneration("operation", status = "completed")
        viewModel.openCompletedPhoto(photo); advanceUntilIdle()
        assertTrue(viewModel.uiState.value is GenerationUiState.Error)
        viewModel.openCompletedPhoto(photo); advanceUntilIdle()
        assertTrue(viewModel.uiState.value is GenerationUiState.Success)
        verify(repository, times(2)).result("operation")
        verify(repository, never()).generateImage(any(), any(), any())
        verify(repository, never()).details(any())
    }

    @Test fun `an expired gallery photo is reported unavailable and does not generate a replacement`() = runTest {
        whenever(repository.result("operation")).thenReturn(Response.error(410, okhttp3.ResponseBody.create(null, "expired")))
        viewModel.openCompletedPhoto(RecoverableGeneration("operation", status = "completed")); advanceUntilIdle()
        assertTrue((viewModel.uiState.value as GenerationUiState.Error).isExpired)
        verify(repository, never()).generateImage(any(), any(), any())
    }

    @Test fun `processing entries cannot be opened through the completed photo shortcut`() = runTest {
        viewModel.openCompletedPhoto(RecoverableGeneration("operation", status = "processing")); advanceUntilIdle()
        assertTrue(viewModel.uiState.value is GenerationUiState.Idle)
        verify(repository, never()).result(any())
        verify(repository, never()).generateImage(any(), any(), any())
    }

    @Test fun `ready notification uses the saved local photo even after the remote copy expires`() = runTest {
        val uri: Uri = mock()
        whenever(repository.savedUri("owner", "operation")).thenReturn(uri)
        whenever(repository.viewed("operation")).thenReturn(Response.success(Unit))
        assertEquals(uri, viewModel.savedGalleryPhoto("operation"))
        viewModel.focusSavedGalleryPhoto("operation")
        assertEquals(uri, viewModel.gallery.value.savedUris["operation"])
        assertTrue(viewModel.savedResults.value.contains(viewModel.resultKey("", "operation")))
        verify(repository, never()).viewed(any())
        viewModel.markFocusedViewed("operation"); advanceUntilIdle()
        verify(repository).viewed("operation")
        verify(repository, never()).result(any())
        verify(repository, never()).generateImage(any(), any(), any())
    }

    @Test fun `late saved notification lookup cannot populate the next account gallery`() = runTest {
        val uri = CompletableDeferred<Uri?>()
        whenever(repository.savedUri("owner", "operation")).doSuspendableAnswer { uri.await() }
        val lookup = kotlinx.coroutines.CoroutineScope(coroutineContext).async { viewModel.savedGalleryPhoto("operation") }
        runCurrent()
        viewModel.bindAccount("next-owner")
        uri.complete(mock()); advanceUntilIdle()
        assertEquals(null, lookup.await())
        assertTrue(viewModel.gallery.value.savedUris.isEmpty())
        assertTrue(viewModel.savedResults.value.isEmpty())
    }

    @Test fun `an older failed notification explains the failure rather than showing endless generation`() = runTest {
        whenever(repository.result("operation")).thenReturn(Response.error(409, okhttp3.ResponseBody.create(null,
            """{"id":"operation","status":"failed","failureReason":"The provider rejected this photograph."}""")))
        viewModel.openCompletedPhoto(RecoverableGeneration("operation", status = "completed")); advanceUntilIdle()
        val error = viewModel.uiState.value as GenerationUiState.Error
        assertTrue(error.message.contains("rejected"))
        verify(repository, never()).generateImage(any(), any(), any())
    }

    @Test fun `a stale background saved lookup cannot restore a photo deleted from Saved`() = runTest {
        val uri: Uri = mock()
        whenever(uri.lastPathSegment).thenReturn("42")
        whenever(repository.savedUri("owner", "operation")).thenReturn(uri)
        viewModel.savedGalleryPhoto("operation")
        val lookup = CompletableDeferred<Uri?>()
        whenever(repository.savedUri("owner", "operation")).doSuspendableAnswer { lookup.await() }
        whenever(repository.gallery(null)).thenReturn(Response.success(
            com.itsdhruvbhardwaj.picme.data.model.GenerationGalleryResponse(listOf(
                RecoverableGeneration("operation", status = "completed", resultAvailable = true, resultExpiresAt = "2030-01-01T00:00:00.000Z")))))
        viewModel.refreshGallery(); runCurrent()
        viewModel.forgetSavedGeneration(uri)
        lookup.complete(uri); advanceUntilIdle()
        assertTrue(viewModel.gallery.value.savedUris.isEmpty())
        assertTrue(viewModel.savedResults.value.isEmpty())
        verify(repository, never()).generateImage(any(), any(), any())
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
