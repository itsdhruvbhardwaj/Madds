package com.itsdhruvbhardwaj.picme.ui.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.model.Style
import com.itsdhruvbhardwaj.picme.data.model.StyleCollection
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface ExploreUiState {
    data object Loading : ExploreUiState
    data class Success(
        val styles: List<Style>,
        val hasMore: Boolean,
        val isLoadingMore: Boolean = false,
        val loadMoreError: String? = null,
        val refreshError: String? = null
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
    private val _collections = MutableStateFlow<List<StyleCollection>>(emptyList())
    val collections: StateFlow<List<StyleCollection>> = _collections.asStateFlow()
    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing.asStateFlow()
    private var refreshJob: Job? = null

    private var currentQuery = ""
    private var currentCollection: String? = null
    private var currentPage = 0
    private var generation = 0
    private var isLoadingMore = false
    private var searchJob: Job? = null

    init {
        viewModelScope.launch { styleRepository.stylePreference.collectLatest {
            loadFirstPage(currentQuery, debounce = false)
            val selected = styleRepository.stylePreference.value
            styleRepository.getCollections().onSuccess { if (styleRepository.stylePreference.value == selected) _collections.value = it }
        } }
    }

    fun selectCollection(collection: String?) {
        if (collection == currentCollection) return
        currentCollection = collection
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

    fun refresh(): Job {
        refreshJob?.takeIf { it.isActive }?.let { return it }
        _isRefreshing.value = true
        return viewModelScope.launch {
            try {
              coroutineScope {
                val selected = styleRepository.stylePreference.value
                launch { styleRepository.getCollections().onSuccess {
                    if (styleRepository.stylePreference.value == selected) _collections.value = it
                } }
                loadFirstPage(currentQuery, debounce = false, keepContent = true).join()
              }
            } finally { _isRefreshing.value = false }
        }.also { refreshJob = it }
    }

    private fun loadFirstPage(query: String, debounce: Boolean, keepContent: Boolean = false): Job {
        searchJob?.cancel()
        val previous = if (keepContent) _uiState.value as? ExploreUiState.Success else null
        val previousPage = currentPage
        val selectedPreference = styleRepository.stylePreference.value
        val selectedCollection = currentCollection
        val requestGeneration = ++generation
        currentPage = 0
        isLoadingMore = false
        val job = viewModelScope.launch {
            if (debounce) delay(SEARCH_DEBOUNCE_MS)
            val cached = if (previous == null) styleRepository.getCachedExplore(selectedPreference, selectedCollection, query) else null
            if (requestGeneration != generation) return@launch
            // A previous session's shuffled pages cannot be continued with this session's seed.
            val fallback = previous ?: cached?.let { ExploreUiState.Success(it, hasMore = false) }
            _uiState.value = fallback?.copy(isLoadingMore = false, loadMoreError = null, refreshError = null) ?: ExploreUiState.Loading
            val result = styleRepository.getStyles(
                page = 1,
                limit = PAGE_SIZE,
                collection = selectedCollection,
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
                    styleRepository.saveExploreCache(selectedPreference, selectedCollection, query, response.styles)
                },
                onFailure = { error ->
                    if (fallback != null) {
                        currentPage = if (previous != null) previousPage else 0
                        _uiState.value = fallback.copy(isLoadingMore = false, refreshError =
                            if (previous == null) "Couldn't refresh. Showing saved styles; some images may need a connection. Pull down to retry."
                            else error.message ?: "Couldn't refresh styles. Pull down to retry.")
                    } else _uiState.value = ExploreUiState.Error(error.message ?: "Failed to load styles.")
                }
            )
        }
        searchJob = job
        return job
    }

    fun loadNextPage() {
        val state = _uiState.value as? ExploreUiState.Success ?: return
        if (_isRefreshing.value || !state.hasMore || state.isLoadingMore || isLoadingMore) return

        val requestGeneration = generation
        val nextPage = currentPage + 1
        val selectedPreference = styleRepository.stylePreference.value
        val selectedCollection = currentCollection
        val selectedQuery = currentQuery
        isLoadingMore = true
        _uiState.value = state.copy(isLoadingMore = true, loadMoreError = null)

        viewModelScope.launch {
            val result = styleRepository.getStyles(
                page = nextPage,
                limit = PAGE_SIZE,
                collection = selectedCollection,
                search = selectedQuery.takeIf { it.isNotEmpty() },
                trendingFirst = true
            )
            if (requestGeneration != generation) return@launch
            isLoadingMore = false
            val currentState = _uiState.value as? ExploreUiState.Success ?: return@launch
            result.fold(
                onSuccess = { response ->
                    currentPage = response.pagination.currentPage
                    val combined = (currentState.styles + response.styles).distinctBy { it.id }
                    _uiState.value = currentState.copy(
                        styles = combined,
                        hasMore = response.pagination.hasNextPage,
                        isLoadingMore = false
                    )
                    styleRepository.saveExploreCache(selectedPreference, selectedCollection, selectedQuery, combined)
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
