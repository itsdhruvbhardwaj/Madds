package com.itsdhruvbhardwaj.picme.ui.screens.create

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.repository.AmbiguousOutcomeException
import com.itsdhruvbhardwaj.picme.data.repository.DuplicateOperationException
import com.itsdhruvbhardwaj.picme.data.repository.GenerationRepository
import com.itsdhruvbhardwaj.picme.data.repository.InsufficientCreditsException
import com.itsdhruvbhardwaj.picme.utils.ImageUtils
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

sealed interface GenerationUiState {
    data object Idle : GenerationUiState
    data object Uploading : GenerationUiState
    data object Processing : GenerationUiState
    data class Success(val imageBase64: String) : GenerationUiState
    data class Error(
        val message: String,
        val canRetryWithNewKey: Boolean = true,
        val isAmbiguous: Boolean = false
    ) : GenerationUiState
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

    private val _isInterstitialVisible = MutableStateFlow(false)
    val isInterstitialVisible: StateFlow<Boolean> = _isInterstitialVisible.asStateFlow()

    private val _eventFlow = MutableSharedFlow<GenerationEvent>()
    val eventFlow: SharedFlow<GenerationEvent> = _eventFlow.asSharedFlow()

    private var currentIdempotencyKey: String? = null
    var onProfileRefreshRequested: (() -> Unit)? = null
    
    private var statusJob: Job? = null

    fun setSelectedPhotos(uris: List<Uri>) {
        _selectedPhotos.value = uris
    }

    fun setInterstitialVisible(visible: Boolean) {
        _isInterstitialVisible.value = visible
    }

    fun generateImage(styleId: String, isRetry: Boolean = false) {
        val uris = _selectedPhotos.value
        if (uris.isEmpty()) {
            _uiState.value = GenerationUiState.Error("No photos selected. Please go back and select your photos.")
            return
        }

        if (_uiState.value is GenerationUiState.Uploading || _uiState.value is GenerationUiState.Processing) return

        if (!isRetry || currentIdempotencyKey == null) {
            currentIdempotencyKey = UUID.randomUUID().toString()
        }

        viewModelScope.launch {
            _uiState.value = GenerationUiState.Uploading
            
            // Start background status cycling immediately
            startStatusCycle()

            val result = generationRepository.generateImage(styleId, uris, currentIdempotencyKey!!)
            
            result.fold(
                onSuccess = { response ->
                    statusJob?.cancel()
                    _uiState.value = GenerationUiState.Processing
                    _statusMessage.value = "Your masterpiece is ready!"
                    
                    if (response.image != null) {
                        // Success! The ResultScreen will handle navigation
                        _uiState.value = GenerationUiState.Success(response.image)
                        onProfileRefreshRequested?.invoke()
                    } else {
                        _uiState.value = GenerationUiState.Error("The AI couldn't generate an image. Please try again.")
                    }
                },
                onFailure = { error ->
                    statusJob?.cancel()
                    handleGenerationFailure(error)
                }
            )
        }
    }

    private fun startStatusCycle() {
        statusJob?.cancel()
        val messages = listOf(
            "Preparing your photo...",
            "Applying your chosen style...",
            "Adding the finishing touches...",
            "Your masterpiece is almost ready..."
        )
        statusJob = viewModelScope.launch {
            for (msg in messages) {
                _statusMessage.value = msg
                // Adaptive delay for smooth feel
                delay(if (msg.contains("Preparing")) 2000 else 5000)
            }
        }
    }

    private fun handleGenerationFailure(error: Throwable) {
        when (error) {
            is InsufficientCreditsException -> {
                _uiState.value = GenerationUiState.Error(
                    message = "You need ${error.required} credits for this style, but you have ${error.available}.",
                    canRetryWithNewKey = true
                )
                onProfileRefreshRequested?.invoke()
            }
            is AmbiguousOutcomeException -> {
                _uiState.value = GenerationUiState.Error(
                    message = error.message ?: "Connection lost. Status unconfirmed.",
                    canRetryWithNewKey = false,
                    isAmbiguous = true
                )
            }
            is DuplicateOperationException -> {
                _uiState.value = GenerationUiState.Error(
                    message = "This generation is already in progress or has been registered. Please check your history.",
                    canRetryWithNewKey = false
                )
            }
            else -> {
                val friendlyMessage = when {
                    error.message?.contains("401") == true -> "Session expired. Please sign in again."
                    error.message?.contains("429") == true -> "AI server is busy. Please try again in a few moments."
                    else -> error.message ?: "Failed to generate image. Please check your connection."
                }
                _uiState.value = GenerationUiState.Error(
                    message = friendlyMessage,
                    canRetryWithNewKey = true
                )
            }
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
    
    fun resetState() {
        statusJob?.cancel()
        _uiState.value = GenerationUiState.Idle
        _statusMessage.value = "Preparing your photo..."
        _isActionLoading.value = false
        _isInterstitialVisible.value = false
        currentIdempotencyKey = null
    }

    override fun onCleared() {
        statusJob?.cancel()
    }
}
