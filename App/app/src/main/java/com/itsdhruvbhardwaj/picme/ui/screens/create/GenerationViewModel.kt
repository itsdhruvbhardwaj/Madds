package com.itsdhruvbhardwaj.picme.ui.screens.create

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.repository.GenerationRepository
import com.itsdhruvbhardwaj.picme.utils.ImageUtils
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface GenerationUiState {
    data object Idle : GenerationUiState
    data object Uploading : GenerationUiState
    data object Processing : GenerationUiState
    data class Success(val imageBase64: String) : GenerationUiState
    data class Error(val message: String) : GenerationUiState
}

sealed interface GenerationEvent {
    data class ShowSnackbar(val message: String) : GenerationEvent
}

class GenerationViewModel(
    private val generationRepository: GenerationRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<GenerationUiState>(GenerationUiState.Idle)
    val uiState: StateFlow<GenerationUiState> = _uiState.asStateFlow()

    private val _selectedPhotos = MutableStateFlow<List<Uri>>(emptyList())
    val selectedPhotos: StateFlow<List<Uri>> = _selectedPhotos.asStateFlow()

    private val _statusMessage = MutableStateFlow("Preparing your photo...")
    val statusMessage: StateFlow<String> = _statusMessage.asStateFlow()

    private val _isActionLoading = MutableStateFlow(false)
    val isActionLoading: StateFlow<Boolean> = _isActionLoading.asStateFlow()

    private val _eventFlow = MutableSharedFlow<GenerationEvent>()
    val eventFlow: SharedFlow<GenerationEvent> = _eventFlow.asSharedFlow()

    fun setSelectedPhotos(uris: List<Uri>) {
        _selectedPhotos.value = uris
    }

    fun generateImage(styleId: String) {
        val uris = _selectedPhotos.value
        if (uris.isEmpty()) {
            _uiState.value = GenerationUiState.Error("No photos selected. Please go back and select your photos.")
            return
        }

        if (_uiState.value is GenerationUiState.Uploading || _uiState.value is GenerationUiState.Processing) return

        viewModelScope.launch {
            _uiState.value = GenerationUiState.Uploading
            _statusMessage.value = "Preparing your photo..."
            
            // Artificial delay to show initial state
            delay(1000)
            _statusMessage.value = "Uploading your photos..."

            val result = generationRepository.generateImage(styleId, uris)
            
            result.fold(
                onSuccess = { response ->
                    _uiState.value = GenerationUiState.Processing
                    startProcessingMessages()
                    
                    if (response.image != null) {
                        _uiState.value = GenerationUiState.Success(response.image)
                    } else {
                        _uiState.value = GenerationUiState.Error("The AI couldn't generate an image. Please try again.")
                    }
                },
                onFailure = { error ->
                    val friendlyMessage = when {
                        error.message?.contains("401") == true -> "Session expired. Please sign in again."
                        error.message?.contains("402") == true -> "Insufficient credits. Please top up."
                        error.message?.contains("429") == true -> "AI server is busy. Please try again in a few moments."
                        error.message?.contains("timeout") == true -> "Connection timed out. Our AI engine is warming up, please retry."
                        else -> error.message ?: "Failed to generate image. Please check your connection."
                    }
                    _uiState.value = GenerationUiState.Error(friendlyMessage)
                }
            )
        }
    }

    fun saveImageToGallery(context: Context) {
        val state = _uiState.value
        if (state !is GenerationUiState.Success || _isActionLoading.value) return

        viewModelScope.launch {
            _isActionLoading.value = true
            val bitmap = ImageUtils.decodeBase64ToBitmap(state.imageBase64)
            if (bitmap != null) {
                val result = ImageUtils.saveBitmapToGallery(context, bitmap)
                if (result.isSuccess) {
                    _eventFlow.emit(GenerationEvent.ShowSnackbar("Image saved to gallery!"))
                } else {
                    _eventFlow.emit(GenerationEvent.ShowSnackbar("Failed to save image: ${result.exceptionOrNull()?.message}"))
                }
            } else {
                _eventFlow.emit(GenerationEvent.ShowSnackbar("Failed to decode image for saving."))
            }
            _isActionLoading.value = false
        }
    }

    fun shareImage(context: Context) {
        val state = _uiState.value
        if (state !is GenerationUiState.Success || _isActionLoading.value) return

        viewModelScope.launch {
            _isActionLoading.value = true
            val bitmap = ImageUtils.decodeBase64ToBitmap(state.imageBase64)
            if (bitmap != null) {
                val result = ImageUtils.shareImage(context, bitmap)
                if (result.isFailure) {
                    _eventFlow.emit(GenerationEvent.ShowSnackbar("Failed to share image: ${result.exceptionOrNull()?.message}"))
                }
            } else {
                _eventFlow.emit(GenerationEvent.ShowSnackbar("Failed to decode image for sharing."))
            }
            _isActionLoading.value = false
        }
    }

    private fun startProcessingMessages() {
        val messages = listOf(
            "Applying your chosen style...",
            "Adding the finishing touches...",
            "Your masterpiece is almost ready..."
        )
        viewModelScope.launch {
            for (msg in messages) {
                if (_uiState.value !is GenerationUiState.Processing) break
                _statusMessage.value = msg
                delay(4000)
            }
        }
    }
    
    fun resetState() {
        _uiState.value = GenerationUiState.Idle
        _statusMessage.value = "Preparing your photo..."
        _isActionLoading.value = false
    }
}
