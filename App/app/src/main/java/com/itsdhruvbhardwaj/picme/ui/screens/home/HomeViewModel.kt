package com.itsdhruvbhardwaj.picme.ui.screens.home

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.model.HomeSection
import com.itsdhruvbhardwaj.picme.data.model.Style
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class HomeSectionData(
    val config: HomeSection,
    val styles: List<Style>? = null,
    val error: String? = null
)

sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Success(val sections: List<HomeSectionData>) : HomeUiState
    data class Error(val message: String) : HomeUiState
}

class HomeViewModel(
    private val styleRepository: StyleRepository
) : ViewModel() {

    companion object {
        private const val TAG = "PicMeHome"
    }

    private val _uiState = MutableStateFlow<HomeUiState>(HomeUiState.Loading)
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()
    private val loadMutex = Mutex()

    init {
        loadHomeData()
    }

    fun loadHomeData() {
        viewModelScope.launch {
            if (loadMutex.isLocked) {
                Log.d(TAG, "Home load skipped because another load is still running")
                return@launch
            }
            loadMutex.withLock {
                Log.d(TAG, "Loading Home configuration")
                val currentState = _uiState.value
                val previousSections = if (currentState is HomeUiState.Success) currentState.sections else emptyList()
                if (currentState !is HomeUiState.Success) _uiState.value = HomeUiState.Loading

                styleRepository.getHomeConfig().fold(
                    onSuccess = { configResponse ->
                        val visibleConfigs = configResponse.sections
                            .filter { it.visible }
                            .sortedBy { it.order }
                        Log.d(TAG, "Home configuration loaded: ${visibleConfigs.size} visible sections")
                        val initialSections = visibleConfigs.map { config ->
                            previousSections.find { it.config.id == config.id }
                                ?.copy(config = config)
                                ?: HomeSectionData(config)
                        }
                        _uiState.value = HomeUiState.Success(initialSections)
                        visibleConfigs.forEach { config ->
                            launch { loadSectionStyles(config) }
                        }
                    },
                    onFailure = { error ->
                        Log.e(TAG, "Home configuration request failed", error)
                        if (_uiState.value !is HomeUiState.Success) {
                            _uiState.value = HomeUiState.Error(mapErrorMessage(error.message))
                        }
                    }
                )
            }
        }
    }

    private suspend fun loadSectionStyles(config: HomeSection) {
        Log.d(TAG, "Loading styles for section '${config.title}' (${config.slug})")
        val stylesResult = styleRepository.getStyles(
            page = 1,
            limit = 10,
            collection = config.slug
        )
        stylesResult.fold(
            onSuccess = { response ->
                Log.d(TAG, "Loaded ${response.styles.size} styles for '${config.title}'")
            },
            onFailure = { error ->
                Log.e(TAG, "Styles request failed for '${config.title}' (${config.slug})", error)
            }
        )
        updateSection(config.id) {
            if (stylesResult.isSuccess) {
                val styles = stylesResult.getOrThrow().styles
                if (styles.isNotEmpty()) copy(styles = styles, error = null) else null
            } else if (this.styles != null) {
                copy(error = null)
            } else {
                copy(styles = emptyList(), error = "Failed to load")
            }
        }
    }

    private fun updateSection(sectionId: String, transform: HomeSectionData.() -> HomeSectionData?) {
        _uiState.update { currentState ->
            if (currentState is HomeUiState.Success) {
                currentState.copy(
                    sections = currentState.sections.mapNotNull { section ->
                        if (section.config.id == sectionId) section.transform() else section
                    }
                )
            } else {
                currentState
            }
        }
    }

    private fun mapErrorMessage(message: String?): String = when (message) {
        "timeout" -> "Connection timed out. Our server is waking up, please try again."
        "network_error" -> "Unable to connect. Please check your internet."
        "server_overloaded" -> "madds is busy right now. Please try again in a moment."
        "session_expired" -> "Your session has expired. Please sign in again."
        else -> "Failed to load Home configuration. Please try again."
    }
}
