package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.model.Style
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

sealed interface FavoritesUiState {
    data object Loading : FavoritesUiState
    data class Success(val styles: List<Style>) : FavoritesUiState
    data class Error(val message: String) : FavoritesUiState
}

class FavoritesViewModel(
    private val styleRepository: StyleRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<FavoritesUiState>(FavoritesUiState.Loading)
    val uiState: StateFlow<FavoritesUiState> = _uiState.asStateFlow()

    private val _favoriteIds = MutableStateFlow<List<String>?>(null)

    init {
        observeCacheAndIds()
    }

    fun loadFavorites() {
        viewModelScope.launch {
            // Only show loading if we don't have any data yet
            if (_favoriteIds.value == null) {
                _uiState.value = FavoritesUiState.Loading
            }
            
            val result = styleRepository.getFavorites()
            result.fold(
                onSuccess = { styles ->
                    _favoriteIds.value = styles.map { it.id }
                },
                onFailure = { error ->
                    // Only show error if we don't have data
                    if (_favoriteIds.value == null) {
                        _uiState.value = FavoritesUiState.Error(error.message ?: "Failed to load favorites")
                    }
                }
            )
        }
    }

    private fun observeCacheAndIds() {
        combine(_favoriteIds, styleRepository.cachedStyles) { ids, cache ->
            if (ids == null) return@combine
            
            val updatedFavorites = ids.mapNotNull { id ->
                cache[id]
            }.filter { it.isFavorite }
            
            _uiState.value = FavoritesUiState.Success(updatedFavorites)
        }.launchIn(viewModelScope)
    }
}
