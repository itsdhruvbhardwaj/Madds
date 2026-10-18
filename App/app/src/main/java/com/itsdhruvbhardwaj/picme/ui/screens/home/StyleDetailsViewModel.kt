package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.model.Style
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

sealed interface StyleDetailsUiState {
    data object Loading : StyleDetailsUiState
    data class Success(val style: Style) : StyleDetailsUiState
    data class Error(val message: String) : StyleDetailsUiState
}

class StyleDetailsViewModel(
    private val styleRepository: StyleRepository,
    private val styleId: String
) : ViewModel() {

    private val _uiState = MutableStateFlow<StyleDetailsUiState>(StyleDetailsUiState.Loading)
    val uiState: StateFlow<StyleDetailsUiState> = _uiState.asStateFlow()

    private val _toastEvent = MutableSharedFlow<String>()
    val toastEvent: SharedFlow<String> = _toastEvent.asSharedFlow()

    init {
        observeStyleCache()
        loadStyleDetails()
    }

    private fun observeStyleCache() {
        viewModelScope.launch {
            styleRepository.cachedStyles.collectLatest { cache ->
                cache[styleId]?.let { style ->
                    _uiState.value = StyleDetailsUiState.Success(style)
                }
            }
        }
    }

    private fun loadStyleDetails() {
        viewModelScope.launch {
            // If not in cache, we fetch it (though usually it will be cached from Home/Grid)
            if (styleRepository.getStyleById(styleId) == null) {
                _uiState.value = StyleDetailsUiState.Loading
                val result = styleRepository.getStyles(page = 1, limit = 50)
                if (result.isFailure) {
                    _uiState.value = StyleDetailsUiState.Error(result.exceptionOrNull()?.message ?: "Failed to load style details")
                }
            }
        }
    }

    fun toggleFavorite() {
        val currentState = _uiState.value
        if (currentState is StyleDetailsUiState.Success) {
            val style = currentState.style
            val willBeFavorite = !style.isFavorite
            viewModelScope.launch {
                val result = styleRepository.toggleFavorite(styleId, willBeFavorite)
                if (result.isSuccess) {
                    _toastEvent.emit(
                        if (willBeFavorite) "Added to favorites" else "Removed from favorites"
                    )
                }
            }
        }
    }

    companion object {
        fun provideFactory(
            styleRepository: StyleRepository,
            styleId: String
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return StyleDetailsViewModel(styleRepository, styleId) as T
            }
        }
    }
}
