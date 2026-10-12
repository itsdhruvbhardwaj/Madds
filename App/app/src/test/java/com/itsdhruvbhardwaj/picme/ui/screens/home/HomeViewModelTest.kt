package com.itsdhruvbhardwaj.picme.ui.screens.home

import com.itsdhruvbhardwaj.picme.data.model.HomeConfigResponse
import com.itsdhruvbhardwaj.picme.data.model.HomeSection
import com.itsdhruvbhardwaj.picme.data.model.StyleResponse
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
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
import org.mockito.kotlin.anyOrNull
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {

    @Mock
    private lateinit var styleRepository: StyleRepository

    private lateinit var viewModel: HomeViewModel
    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial loadHomeData updates state to Success with sections`() = runTest {
        // Arrange
        val sections = listOf(
            HomeSection(id = "1", title = "Section 1", type = "collection", slug = "slug1", order = 1),
            HomeSection(id = "2", title = "Section 2", type = "popular", order = 2)
        )
        `when`(styleRepository.getHomeConfig()).thenReturn(Result.success(HomeConfigResponse(sections)))
        
        // Ensure all possible filter combinations are stubbed to avoid Mockito null defaults
        `when`(styleRepository.getStyles(any(), any(), anyOrNull(), anyOrNull())).thenReturn(
            Result.success(StyleResponse(styles = listOf(mock())))
        )

        // Act
        viewModel = HomeViewModel(styleRepository)
        advanceUntilIdle()

        // Assert
        val state = viewModel.uiState.value
        assertTrue("Expected Success state but was $state", state is HomeUiState.Success)
        val successState = state as HomeUiState.Success
        
        // Filter empty sections logic might apply, but here we mocked data for all
        assertEquals(2, successState.sections.size)
        assertEquals("Section 1", successState.sections[0].config.title)
    }

    @Test
    fun `loadHomeData with config failure updates state to Error`() = runTest {
        // Arrange
        `when`(styleRepository.getHomeConfig()).thenReturn(Result.failure(Exception("timeout")))

        // Act
        viewModel = HomeViewModel(styleRepository)
        advanceUntilIdle()

        // Assert
        val state = viewModel.uiState.value
        assertTrue(state is HomeUiState.Error)
        assertTrue((state as HomeUiState.Error).message.contains("timed out"))
    }

    @Test
    fun `loadHomeData hides empty sections`() = runTest {
        // Arrange
        val sections = listOf(
            HomeSection(id = "1", title = "Empty Section", type = "collection", slug = "empty", order = 1)
        )
        `when`(styleRepository.getHomeConfig()).thenReturn(Result.success(HomeConfigResponse(sections)))
        `when`(styleRepository.getStyles(any(), any(), anyOrNull(), eq("empty"))).thenReturn(
            Result.success(StyleResponse(styles = emptyList()))
        )

        // Act
        viewModel = HomeViewModel(styleRepository)
        advanceUntilIdle()

        // Assert
        val state = viewModel.uiState.value
        assertTrue(state is HomeUiState.Success)
        val successState = state as HomeUiState.Success
        // The section should be removed because it has no styles
        assertEquals(0, successState.sections.size)
    }
}
