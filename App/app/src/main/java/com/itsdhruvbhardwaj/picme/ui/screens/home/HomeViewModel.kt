package com.itsdhruvbhardwaj.picme.ui.screens.home

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
    val styles: List<Style>? = null, // null means loading (show skeleton)
    val error: String? = null
)

sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Success(
        val categories: List<String>,
        val sections: List<HomeSectionData>
    ) : HomeUiState
    data class Error(val message: String) : HomeUiState
}

class HomeViewModel(
    private val styleRepository: StyleRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<HomeUiState>(HomeUiState.Loading)
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private val loadMutex = Mutex()

    init {
        loadHomeData()
    }

    /**
     * Loads Home configuration and styles. 
     * Preserves existing data during refresh to avoid flickering back to skeletons.
     */
    fun loadHomeData() {
        viewModelScope.launch {
            if (loadMutex.isLocked) return@launch
            
            loadMutex.withLock {
                val currentState = _uiState.value
                val previousSections = if (currentState is HomeUiState.Success) currentState.sections else emptyList()

                // Only show full-screen loading if we have no successful data yet
                if (currentState !is HomeUiState.Success) {
                    _uiState.value = HomeUiState.Loading
                }
                
                val configResult = styleRepository.getHomeConfig()
                
                configResult.fold(
                    onSuccess = { configResponse ->
                        val visibleConfigs = configResponse.sections
                            .filter { it.visible }
                            .sortedBy { it.order }
                        
                        // Map new config to sections, preserving loaded data from previous state where IDs match
                        val initialSections = visibleConfigs.map { config ->
                            val previous = previousSections.find { it.config.id == config.id }
                            if (previous != null) {
                                previous.copy(config = config)
                            } else {
                                HomeSectionData(config)
                            }
                        }
                        
                        _uiState.value = HomeUiState.Success(
                            categories = listOf("All", "Trending", "Portrait", "Artistic"),
                            sections = initialSections
                        )

                        // Launch concurrent style loading for each section
                        visibleConfigs.forEach { config ->
                            launch {
                                loadSectionStyles(config)
                            }
                        }
                    },
                    onFailure = { error ->
                        val friendlyMessage = mapErrorMessage(error.message)
                        // Only show global error if we have no usable content
                        if (_uiState.value !is HomeUiState.Success) {
                            _uiState.value = HomeUiState.Error(friendlyMessage)
                        }
                    }
                )
            }
        }
    }

    private suspend fun loadSectionStyles(config: HomeSection) {
        val collectionSlug = if (config.type == "popular") "Popular" else config.slug
        val stylesResult = styleRepository.getStyles(
            page = 1,
            limit = 10,
            collection = collectionSlug
        )
        
        updateSection(config.id) {
            if (stylesResult.isSuccess) {
                val styles = stylesResult.getOrThrow().styles
                if (styles.isNotEmpty()) {
                    copy(styles = styles, error = null)
                } else {
                    null // Hide empty sections
                }
            } else {
                // If it failed but we have old data, keep old data but clear error if any
                // If it was the first load, show error in section
                if (this.styles != null) {
                    this.copy(error = null) 
                } else {
                    copy(styles = emptyList(), error = "Failed to load")
                }
            }
        }
    }

    private fun updateSection(sectionId: String, transform: HomeSectionData.() -> HomeSectionData?) {
        _uiState.update { currentState ->
            if (currentState is HomeUiState.Success) {
                val updatedSections = currentState.sections.mapNotNull { section ->
                    if (section.config.id == sectionId) {
                        section.transform()
                    } else {
                        section
                    }
                }
                currentState.copy(sections = updatedSections)
            } else {
                currentState
            }
        }
    }

    private fun mapErrorMessage(message: String?): String {
        return when (message) {
            "timeout" -> "Connection timed out. Our server is waking up, please try again."
            "network_error" -> "Unable to connect. Please check your internet."
            "server_overloaded" -> "PicMe is busy right now. Please try again in a moment."
            "session_expired" -> "Your session has expired. Please sign in again."
            else -> "Failed to load Home configuration. Please try again."
        }
    }
}
