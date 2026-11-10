package com.itsdhruvbhardwaj.picme.ui.screens.search

import com.itsdhruvbhardwaj.picme.data.model.*
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.*

@OptIn(ExperimentalCoroutinesApi::class)
class ExploreRefreshTest {
    private val dispatcher=StandardTestDispatcher()
    private val repo=mock<StyleRepository>()
    private val style=Style(id="one",name="First style")
    @Before fun setup(){Dispatchers.setMain(dispatcher);whenever(repo.stylePreference).thenReturn(MutableStateFlow("all"))}
    @After fun cleanup(){Dispatchers.resetMain()}
    @Test fun `refresh retains content and repeated pulls share a single request`()=runTest(dispatcher){
        whenever(repo.getCollections()).thenReturn(Result.success(emptyList()))
        val response=StyleResponse(listOf(style),PaginationMetadata(currentPage=1,totalPages=1,totalCount=1,hasNextPage=false))
        whenever(repo.getStyles(1,30,null,null,true)).thenReturn(Result.success(response))
        val model=ExploreViewModel(repo);advanceUntilIdle()
        val pending=CompletableDeferred<Result<StyleResponse>>()
        // Keep the network suspended to verify state and pagination while refreshing.
        whenever(repo.getStyles(1,30,null,null,true)).doSuspendableAnswer { pending.await() }
        val first=model.refresh();assertSame(first,model.refresh());runCurrent()
        assertTrue(model.isRefreshing.value)
        assertEquals(listOf(style),(model.uiState.value as ExploreUiState.Success).styles)
        model.loadNextPage()
        pending.complete(Result.success(response));advanceUntilIdle()
        assertFalse(model.isRefreshing.value)
        verify(repo,times(2)).getStyles(1,30,null,null,true)
    }
    @Test fun `failed refresh preserves existing styles and exposes a retry message`()=runTest(dispatcher){
        whenever(repo.getCollections()).thenReturn(Result.success(emptyList()))
        val response=StyleResponse(listOf(style),PaginationMetadata(currentPage=1,totalPages=1,totalCount=1,hasNextPage=false))
        whenever(repo.getStyles(1,30,null,null,true)).thenReturn(Result.success(response),Result.failure(Exception("Connection timed out")))
        val model=ExploreViewModel(repo);advanceUntilIdle();model.refresh();advanceUntilIdle()
        val state=model.uiState.value as ExploreUiState.Success
        assertEquals(listOf(style),state.styles);assertEquals("Connection timed out",state.refreshError)
        assertFalse(model.isRefreshing.value)
    }
}
