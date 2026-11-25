package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.model.Style
import com.itsdhruvbhardwaj.picme.data.model.StyleVariantGroup
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

sealed interface StyleDetailsUiState {
    data object Loading : StyleDetailsUiState
    data class Success(val style: Style) : StyleDetailsUiState
    data class Error(val message: String) : StyleDetailsUiState
}

class StyleDetailsViewModel(private val styleRepository: StyleRepository, private val styleId: String) : ViewModel() {
    private val _uiState = MutableStateFlow<StyleDetailsUiState>(StyleDetailsUiState.Loading)
    val uiState: StateFlow<StyleDetailsUiState> = _uiState.asStateFlow()
    private val _toastEvent = MutableSharedFlow<String>()
    val toastEvent: SharedFlow<String> = _toastEvent.asSharedFlow()
    private var selectedId = styleId
    private var group: StyleVariantGroup? = null
    private val pendingFavorites = mutableMapOf<String, Boolean>()
    private val favoriteJobs = mutableMapOf<String, Job>()

    private fun showStyle(incoming: Style) {
        incoming.group?.let { latest ->
            group = latest
            if (latest.variants.orEmpty().none { it.id == selectedId }) selectedId = incoming.id
        }
        val selected = if (incoming.id == selectedId) incoming else
            styleRepository.getStyleById(selectedId) ?: group?.variants.orEmpty().find { it.id == selectedId } ?: return
        _uiState.value = StyleDetailsUiState.Success(selected.copy(
            isFavorite = pendingFavorites[selected.id] ?: selected.isFavorite,
            group = group?.takeIf { it.variants.orEmpty().any { variant -> variant.id == selected.id } }
        ))
    }

    init {
        viewModelScope.launch {
            styleRepository.cachedStyles.collectLatest { cache ->
                cache[selectedId]?.let { showStyle(it) }
            }
        }
        loadStyleDetails()
    }

    fun selectVariant(id: String) {
        val variant = group?.variants.orEmpty().find { it.id == id } ?: return
        selectedId = id
        showStyle(styleRepository.getStyleById(id)?.copy(group = group) ?: variant.copy(group = group))
    }

    fun loadStyleDetails() {
        viewModelScope.launch {
            val cached = styleRepository.getStyleById(styleId)
            cached?.let { showStyle(it) }
            if (cached == null) _uiState.value = StyleDetailsUiState.Loading
            styleRepository.loadStyleById(styleId).fold(onSuccess = { fresh ->
                // A refreshed ungrouped record must not leave an obsolete selector alive.
                if (fresh.group == null) { group = null; selectedId = fresh.id }
                showStyle(fresh)
            }, onFailure = {
                if (cached == null || it.message == "This style is no longer available.") _uiState.value = StyleDetailsUiState.Error(
                    if (it.message in listOf("network_error", "server_overloaded", "timeout")) "Couldn't load this style. Check your connection and try again." else it.message ?: "Couldn't load this style.")
            })
        }
    }

    fun toggleFavorite() {
        val style = (_uiState.value as? StyleDetailsUiState.Success)?.style ?: return
        val id = style.id
        pendingFavorites[id] = !style.isFavorite
        showStyle(style)
        if (favoriteJobs[id]?.isActive == true) return
        favoriteJobs[id] = viewModelScope.launch {
            var confirmed = style.isFavorite
            while (true) {
                val target = pendingFavorites[id] ?: break
                val result = styleRepository.toggleFavorite(id, target)
                if (result.isSuccess) confirmed = target
                if (pendingFavorites[id] == target) {
                    pendingFavorites.remove(id)
                    if (selectedId == id) (_uiState.value as? StyleDetailsUiState.Success)?.style?.let { showStyle(it.copy(isFavorite = confirmed)) }
                    favoriteJobs.remove(id)
                    _toastEvent.emit(if (result.isSuccess) { if (target) "Added to favorites" else "Removed from favorites" } else "Couldn't save your favorite. Please try again.")
                    break
                }
            }
        }
    }

    companion object {
        fun provideFactory(styleRepository: StyleRepository, styleId: String): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST") override fun <T : ViewModel> create(modelClass: Class<T>): T = StyleDetailsViewModel(styleRepository, styleId) as T
        }
    }
}
