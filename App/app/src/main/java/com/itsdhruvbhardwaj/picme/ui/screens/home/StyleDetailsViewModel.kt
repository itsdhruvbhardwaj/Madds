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
import kotlinx.coroutines.Job

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

    private var pendingFavorite: Boolean? = null
    private var favoriteSyncJob: Job? = null

    private fun showStyle(style: Style) {
        _uiState.value = StyleDetailsUiState.Success(
            pendingFavorite?.let { style.copy(isFavorite = it) } ?: style
        )
    }

    init {
        observeStyleCache()
        loadStyleDetails()
    }

    private fun observeStyleCache() {
        viewModelScope.launch {
            styleRepository.cachedStyles.collectLatest { cache ->
                cache[styleId]?.let { style ->
                    showStyle(style)
                }
            }
        }
    }

    fun loadStyleDetails() {
        viewModelScope.launch {
            // If not in cache, we fetch it (though usually it will be cached from Home/Grid)
            val cached = styleRepository.getStyleById(styleId)
            if (cached == null) {
                _uiState.value = StyleDetailsUiState.Loading
            }
            val result = styleRepository.loadStyleById(styleId)
            result.fold(onSuccess = { showStyle(it) }, onFailure = {
                if (cached == null || it.message == "This style is no longer available.") _uiState.value = StyleDetailsUiState.Error(
                    if (it.message in listOf("network_error", "server_overloaded", "timeout")) "Couldn't load this style. Check your connection and try again." else it.message ?: "Couldn't load this style.")
            })
        }
    }

    fun toggleFavorite() {
        val style = (_uiState.value as? StyleDetailsUiState.Success)?.style ?: return
        pendingFavorite = !style.isFavorite
        showStyle(style) // Render the tap immediately, before any network work.
        if (favoriteSyncJob?.isActive == true) return

        favoriteSyncJob = viewModelScope.launch {
            var confirmedFavorite = style.isFavorite
            // Serialize requests and coalesce rapid taps to the latest selection.
            while (true) {
                val target = pendingFavorite ?: break
                val result = styleRepository.toggleFavorite(styleId, target)
                if (result.isSuccess) confirmedFavorite = target
                if (pendingFavorite == target) {
                    pendingFavorite = null
                    (_uiState.value as? StyleDetailsUiState.Success)?.style?.let {
                        showStyle(it.copy(isFavorite = confirmedFavorite))
                    }
                    favoriteSyncJob = null
                    _toastEvent.emit(if (result.isSuccess) {
                        if (target) "Added to favorites" else "Removed from favorites"
                    } else {
                        "Couldn't save your favorite. Please try again."
                    })
                    break
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
