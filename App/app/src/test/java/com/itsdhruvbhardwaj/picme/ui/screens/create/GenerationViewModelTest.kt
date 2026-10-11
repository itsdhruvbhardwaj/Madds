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

@OptIn(ExperimentalCoroutinesApi::class)
class GenerationViewModelTest {

    @Mock
    private lateinit var repository: GenerationRepository
    
    private lateinit var viewModel: GenerationViewModel
    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        Dispatchers.setMain(testDispatcher)
        viewModel = GenerationViewModel(repository)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `generateImage success updates state to Success after processing`() = runTest {
        // Arrange
        val mockUri: Uri = mock()
        viewModel.setSelectedPhotos(listOf(mockUri))
        `when`(repository.generateImage(any(), any())).thenReturn(
            Result.success(GenerationResponse(ok = true, image = "base64data"))
        )

        // Act
        viewModel.generateImage("style1")
        
        // Initial state
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
        `when`(repository.generateImage(any(), any())).thenReturn(
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
