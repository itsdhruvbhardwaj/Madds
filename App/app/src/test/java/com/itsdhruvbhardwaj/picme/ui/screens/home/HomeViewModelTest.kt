package com.itsdhruvbhardwaj.picme.ui.screens.home

import com.itsdhruvbhardwaj.picme.data.model.*
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.*

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val repository = mock<StyleRepository>()
    private val style = Style(id = "one", name = "Portrait")
    private fun feed(styles: List<Style> = listOf(style)) = HomeConfigResponse(listOf(
        HomeSection("portraits", "Portraits", "collection", "Portraits", styles = styles)
    ))

    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun cleanup() { Dispatchers.resetMain() }

    @Test fun `combined feed renders without individual section requests`() = runTest(dispatcher) {
        whenever(repository.getHomeConfig()).thenReturn(Result.success(feed()))
        val model = HomeViewModel(repository)
        advanceUntilIdle()
        val state = model.uiState.value as HomeUiState.Success
        assertEquals(listOf(style), state.sections.single().styles)
        verify(repository, never()).getStyles(any(), any(), anyOrNull(), anyOrNull(), any())
    }

    @Test fun `cached content stays visible when refresh fails`() = runTest(dispatcher) {
        whenever(repository.getCachedHome()).thenReturn(feed())
        whenever(repository.getHomeConfig()).thenReturn(Result.failure(Exception("network_error")))
        val model = HomeViewModel(repository)
        assertTrue(model.uiState.value is HomeUiState.Success)
        advanceUntilIdle()
        val state = model.uiState.value as HomeUiState.Success
        assertEquals(listOf(style), state.sections.single().styles)
        assertNotNull(state.refreshError)
    }

    @Test fun `hung request exits skeleton state and can be retried`() = runTest(dispatcher) {
        whenever(repository.getHomeConfig()).doSuspendableAnswer { awaitCancellation() }
        val model = HomeViewModel(repository)
        advanceUntilIdle()
        assertTrue(model.uiState.value is HomeUiState.Error)
        doReturn(Result.success(feed())).whenever(repository).getHomeConfig()
        model.loadHomeData()
        advanceUntilIdle()
        assertTrue(model.uiState.value is HomeUiState.Success)
    }

    @Test fun `empty successful sections leave no loading skeletons`() = runTest(dispatcher) {
        whenever(repository.getHomeConfig()).thenReturn(Result.success(feed(emptyList())))
        val model = HomeViewModel(repository)
        advanceUntilIdle()
        assertTrue((model.uiState.value as HomeUiState.Success).sections.isEmpty())
    }

    @Test fun `legacy backend loads section previews and preserves order`() = runTest(dispatcher) {
        val sections = listOf(
            HomeSection("second", "Second", "collection", "Two", order = 2),
            HomeSection("first", "First", "collection", "One", order = 1)
        )
        whenever(repository.getHomeConfig()).thenReturn(Result.success(HomeConfigResponse(sections)))
        whenever(repository.getStyles(any(), any(), anyOrNull(), anyOrNull(), any()))
            .thenReturn(Result.success(StyleResponse(styles = listOf(style))))
        val model = HomeViewModel(repository)
        advanceUntilIdle()
        val state = model.uiState.value as HomeUiState.Success
        assertEquals(listOf("first", "second"), state.sections.map { it.config.id })
        assertTrue(state.sections.all { it.styles == listOf(style) })
    }

    @Test fun `configuration timeout shows actionable error`() = runTest(dispatcher) {
        whenever(repository.getHomeConfig()).thenReturn(Result.failure(Exception("timeout")))
        val model = HomeViewModel(repository)
        advanceUntilIdle()
        assertTrue((model.uiState.value as HomeUiState.Error).message.contains("timed out"))
    }

    @Test fun `legacy backend empty sections are hidden`() = runTest(dispatcher) {
        whenever(repository.getHomeConfig()).thenReturn(Result.success(HomeConfigResponse(listOf(
            HomeSection("empty", "Empty", "collection", "Empty")
        ))))
        whenever(repository.getStyles(any(), any(), anyOrNull(), anyOrNull(), any()))
            .thenReturn(Result.success(StyleResponse(styles = emptyList())))
        val model = HomeViewModel(repository)
        advanceUntilIdle()
        assertTrue((model.uiState.value as HomeUiState.Success).sections.isEmpty())
    }
}
