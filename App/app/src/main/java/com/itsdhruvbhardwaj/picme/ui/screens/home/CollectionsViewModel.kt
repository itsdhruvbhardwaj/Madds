package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.model.StyleCollection
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

sealed interface CollectionsUiState {
    data object Loading : CollectionsUiState
    data class Success(val collections: List<StyleCollection>) : CollectionsUiState
    data class Error(val message: String) : CollectionsUiState
}

/** Activity-scoped like HomeViewModel: keeps the loaded catalogue when users open a collection and return. */
class CollectionsViewModel(
    private val styleRepository: StyleRepository
) : ViewModel() {
    private val loadMutex = Mutex()
    private val _uiState = MutableStateFlow<CollectionsUiState>(CollectionsUiState.Loading)
    val uiState: StateFlow<CollectionsUiState> = _uiState.asStateFlow()

    fun loadCollections() {
        viewModelScope.launch {
            if (_uiState.value is CollectionsUiState.Success || loadMutex.isLocked) return@launch
            loadMutex.withLock {
                if (_uiState.value is CollectionsUiState.Success) return@withLock
                _uiState.value = CollectionsUiState.Loading
                styleRepository.getCollections().fold(
                    onSuccess = { collections ->
                        _uiState.value = CollectionsUiState.Success(collections.filter { it.styleCount > 0 })
                    },
                    onFailure = { error ->
                        _uiState.value = CollectionsUiState.Error(
                            error.message ?: "Please check your connection and try again."
                        )
                    }
                )
            }
        }
    }
}
