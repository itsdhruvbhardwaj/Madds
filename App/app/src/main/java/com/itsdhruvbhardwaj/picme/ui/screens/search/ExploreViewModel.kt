package com.itsdhruvbhardwaj.picme.ui.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.model.Style
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface ExploreUiState {
    data object Loading : ExploreUiState
    data class Success(
        val styles: List<Style>,
        val hasMore: Boolean,
        val isLoadingMore: Boolean = false,
        val loadMoreError: String? = null
    ) : ExploreUiState
    data class Error(val message: String) : ExploreUiState
}

class ExploreViewModel(
    private val styleRepository: StyleRepository
) : ViewModel() {

    companion object {
        const val PAGE_SIZE = 30
        private const val SEARCH_DEBOUNCE_MS = 350L
    }

    private val _uiState = MutableStateFlow<ExploreUiState>(ExploreUiState.Loading)
    val uiState: StateFlow<ExploreUiState> = _uiState.asStateFlow()

    private var currentQuery = ""
    private var currentPage = 0
    private var generation = 0
    private var isLoadingMore = false
    private var searchJob: Job? = null

    init {
        loadFirstPage(currentQuery, debounce = false)
    }

    fun search(query: String) {
        val normalized = query.trim()
        if (normalized == currentQuery) return
        currentQuery = normalized
        loadFirstPage(normalized, debounce = true)
    }

    fun retry() {
        loadFirstPage(currentQuery, debounce = false)
    }

    private fun loadFirstPage(query: String, debounce: Boolean) {
        searchJob?.cancel()
        val requestGeneration = ++generation
        currentPage = 0
        isLoadingMore = false
        searchJob = viewModelScope.launch {
            if (debounce) delay(SEARCH_DEBOUNCE_MS)
            _uiState.value = ExploreUiState.Loading
            val result = styleRepository.getStyles(
                page = 1,
                limit = PAGE_SIZE,
                search = query.takeIf { it.isNotEmpty() },
                trendingFirst = true
            )
            if (requestGeneration != generation) return@launch
            result.fold(
                onSuccess = { response ->
                    currentPage = response.pagination.currentPage
                    _uiState.value = ExploreUiState.Success(
                        styles = response.styles,
                        hasMore = response.pagination.hasNextPage
                    )
                },
                onFailure = { error ->
                    _uiState.value = ExploreUiState.Error(error.message ?: "Failed to load styles.")
                }
            )
        }
    }

    fun loadNextPage() {
        val state = _uiState.value as? ExploreUiState.Success ?: return
        if (!state.hasMore || state.isLoadingMore || isLoadingMore) return

        val requestGeneration = generation
        val nextPage = currentPage + 1
        isLoadingMore = true
        _uiState.value = state.copy(isLoadingMore = true, loadMoreError = null)

        viewModelScope.launch {
            val result = styleRepository.getStyles(
                page = nextPage,
                limit = PAGE_SIZE,
                search = currentQuery.takeIf { it.isNotEmpty() },
                trendingFirst = true
            )
            if (requestGeneration != generation) return@launch
            isLoadingMore = false
            val currentState = _uiState.value as? ExploreUiState.Success ?: return@launch
            result.fold(
                onSuccess = { response ->
                    currentPage = response.pagination.currentPage
                    _uiState.value = currentState.copy(
                        styles = currentState.styles + response.styles,
                        hasMore = response.pagination.hasNextPage,
                        isLoadingMore = false
                    )
                },
                onFailure = { error ->
                    _uiState.value = currentState.copy(
                        isLoadingMore = false,
                        loadMoreError = error.message ?: "Failed to load more styles."
                    )
                }
            )
        }
    }
}
