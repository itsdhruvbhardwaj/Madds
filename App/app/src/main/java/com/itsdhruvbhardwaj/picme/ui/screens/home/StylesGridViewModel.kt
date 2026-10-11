package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.model.Style
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface StylesGridUiState {
    data object Loading : StylesGridUiState
    data class Success(
        val styles: List<Style>,
        val isNextPageLoading: Boolean = false,
        val hasMore: Boolean = true
    ) : StylesGridUiState
    data class Error(val message: String) : StylesGridUiState
}

class StylesGridViewModel(
    private val styleRepository: StyleRepository,
    private val category: String?,
    private val collection: String?
) : ViewModel() {

    private val _uiState = MutableStateFlow<StylesGridUiState>(StylesGridUiState.Loading)
    val uiState: StateFlow<StylesGridUiState> = _uiState.asStateFlow()

    private var currentPage = 1
    private val pageSize = 18
    private var isRequestInProgress = false

    init {
        loadInitialStyles()
    }

    private fun loadInitialStyles() {
        if (isRequestInProgress) return
        isRequestInProgress = true
        
        viewModelScope.launch {
            _uiState.value = StylesGridUiState.Loading
            val result = styleRepository.getStyles(
                page = currentPage, 
                limit = pageSize, 
                category = category,
                collection = collection
            )
            
            result.fold(
                onSuccess = { response ->
                    currentPage++
                    _uiState.value = StylesGridUiState.Success(
                        styles = response.styles,
                        hasMore = response.pagination.hasNextPage
                    )
                },
                onFailure = { error ->
                    _uiState.value = StylesGridUiState.Error(error.message ?: "Failed to load styles")
                }
            )
            isRequestInProgress = false
        }
    }

    fun loadNextPage() {
        val currentState = _uiState.value
        if (currentState !is StylesGridUiState.Success || !currentState.hasMore || isRequestInProgress) return
        
        isRequestInProgress = true
        _uiState.value = currentState.copy(isNextPageLoading = true)
        
        viewModelScope.launch {
            val result = styleRepository.getStyles(
                page = currentPage, 
                limit = pageSize, 
                category = category,
                collection = collection
            )
            
            result.fold(
                onSuccess = { response ->
                    currentPage++
                    _uiState.value = currentState.copy(
                        styles = currentState.styles + response.styles,
                        isNextPageLoading = false,
                        hasMore = response.pagination.hasNextPage
                    )
                },
                onFailure = { error ->
                    _uiState.value = currentState.copy(isNextPageLoading = false)
                }
            )
            isRequestInProgress = false
        }
    }
}
