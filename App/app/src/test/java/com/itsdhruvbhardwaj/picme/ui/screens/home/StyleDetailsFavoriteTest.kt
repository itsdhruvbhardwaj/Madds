package com.itsdhruvbhardwaj.picme.ui.screens.home

import com.itsdhruvbhardwaj.picme.data.model.Style
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.*

@OptIn(ExperimentalCoroutinesApi::class)
class StyleDetailsFavoriteTest {
    private val dispatcher = StandardTestDispatcher()
    private val repo = mock<StyleRepository>()
    private val style = Style(id = "test", name = "Test")
    private val cache = MutableStateFlow(mapOf(style.id to style))

    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun cleanup() { Dispatchers.resetMain() }

    private suspend fun create(): StyleDetailsViewModel {
        whenever(repo.cachedStyles).thenReturn(cache)
        whenever(repo.getStyleById(style.id)).thenReturn(style)
        whenever(repo.loadStyleById(style.id)).thenReturn(Result.success(style))
        return StyleDetailsViewModel(repo, style.id).also { dispatcher.scheduler.runCurrent() }
    }

    private fun selected(vm: StyleDetailsViewModel) =
        (vm.uiState.value as StyleDetailsUiState.Success).style.isFavorite

    @Test fun `heart updates before the request completes and survives cache refresh`() = runTest(dispatcher) {
        val vm = create()
        val response = CompletableDeferred<Result<Unit>>()
        whenever(repo.toggleFavorite(style.id, true)).doSuspendableAnswer { response.await() }
        vm.toggleFavorite()
        assertTrue(selected(vm))
        runCurrent()
        cache.value = mapOf(style.id to style.copy(name = "Refreshed"))
        runCurrent()
        assertTrue(selected(vm))
        response.complete(Result.success(Unit))
        runCurrent()
        assertTrue(selected(vm))
    }

    @Test fun `failed save restores the confirmed heart state`() = runTest(dispatcher) {
        val vm = create()
        whenever(repo.toggleFavorite(style.id, true)).thenReturn(Result.failure(Exception("offline")))
        vm.toggleFavorite()
        assertTrue(selected(vm))
        runCurrent()
        assertFalse(selected(vm))
    }

    @Test fun `rapid taps sync in order without overlapping requests`() = runTest(dispatcher) {
        val vm = create()
        val first = CompletableDeferred<Result<Unit>>()
        whenever(repo.toggleFavorite(style.id, true)).doSuspendableAnswer { first.await() }
        whenever(repo.toggleFavorite(style.id, false)).thenReturn(Result.success(Unit))
        vm.toggleFavorite()
        runCurrent()
        vm.toggleFavorite()
        assertFalse(selected(vm))
        runCurrent()
        verify(repo, never()).toggleFavorite(style.id, false)
        first.complete(Result.success(Unit))
        runCurrent()
        inOrder(repo) {
            verify(repo).toggleFavorite(style.id, true)
            verify(repo).toggleFavorite(style.id, false)
        }
        assertFalse(selected(vm))
    }
    @Test fun `selecting a variant preserves its own cost and favorite while another save is in flight`() = runTest(dispatcher) {
        val other = style.copy(id = "pink", name = "Pink", tokensRequired = 15, imageCount = 2)
        val group = com.itsdhruvbhardwaj.picme.data.model.StyleVariantGroup("group", "Pastels", style.id, listOf(style, other))
        val root = style.copy(group = group)
        cache.value = mapOf(style.id to root, other.id to other.copy(group = group))
        whenever(repo.cachedStyles).thenReturn(cache)
        whenever(repo.getStyleById(style.id)).thenReturn(root)
        whenever(repo.getStyleById(other.id)).thenReturn(other.copy(group = group))
        whenever(repo.loadStyleById(style.id)).thenReturn(Result.success(root))
        val vm = StyleDetailsViewModel(repo, style.id)
        runCurrent()
        val first = CompletableDeferred<Result<Unit>>()
        whenever(repo.toggleFavorite(style.id, true)).doSuspendableAnswer { first.await() }
        whenever(repo.toggleFavorite(other.id, true)).thenReturn(Result.success(Unit))
        vm.toggleFavorite(); runCurrent()
        vm.selectVariant(other.id)
        val selected = (vm.uiState.value as StyleDetailsUiState.Success).style
        assertEquals(other.id, selected.id); assertEquals(15, selected.tokensRequired); assertEquals(2, selected.imageCount)
        assertFalse(selected.isFavorite)
        vm.toggleFavorite(); runCurrent()
        first.complete(Result.success(Unit)); runCurrent()
        assertEquals(other.id, (vm.uiState.value as StyleDetailsUiState.Success).style.id)
        assertTrue(selected(vm))
        verify(repo).toggleFavorite(style.id, true)
        verify(repo).toggleFavorite(other.id, true)
        vm.selectVariant("unknown")
        assertEquals(other.id, (vm.uiState.value as StyleDetailsUiState.Success).style.id)
    }
}
