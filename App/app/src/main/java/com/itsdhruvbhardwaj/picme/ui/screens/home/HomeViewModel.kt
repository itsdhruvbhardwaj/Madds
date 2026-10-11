package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.model.Style
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Success(
        val categories: List<String>,
        val trendingStyles: List<Style>,
        val popularStyles: List<Style>
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

    fun loadHomeData() {
        viewModelScope.launch {
            if (loadMutex.isLocked) return@launch
            
            loadMutex.withLock {
                val currentState = _uiState.value
                // If we don't have data yet, show full screen loading
                if (currentState !is HomeUiState.Success) {
                    _uiState.value = HomeUiState.Loading
                }
                
                // Fetch in parallel using async
                val trendingDeferred = async { 
                    styleRepository.getStyles(page = 1, limit = 10, category = "Trending") 
                }
                val popularDeferred = async { 
                    styleRepository.getStyles(page = 1, limit = 10, category = null) 
                }
                
                val trendingResult = trendingDeferred.await()
                val popularResult = popularDeferred.await()
                
                if (trendingResult.isSuccess && popularResult.isSuccess) {
                    _uiState.value = HomeUiState.Success(
                        categories = listOf("All", "Trending", "Portrait", "Artistic"),
                        trendingStyles = trendingResult.getOrThrow().styles,
                        popularStyles = popularResult.getOrThrow().styles
                    )
                } else {
                    val error = trendingResult.exceptionOrNull() ?: popularResult.exceptionOrNull()
                    val friendlyMessage = when (error?.message) {
                        "timeout" -> "Connection timed out. Our server is waking up, please try again."
                        "network_error" -> "Unable to connect. Please check your internet."
                        "server_overloaded" -> "PicMe is busy right now. Please try again in a moment."
                        "session_expired" -> "Your session has expired. Please sign in again."
                        else -> "Failed to load styles. Please try again."
                    }
                    
                    // Only transition to Error state if we have no existing data to show
                    if (_uiState.value !is HomeUiState.Success) {
                        _uiState.value = HomeUiState.Error(friendlyMessage)
                    }
                }
            }
        }
    }
}
