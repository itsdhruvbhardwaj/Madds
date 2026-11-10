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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
        val isAmbiguous: Boolean = false,
        val requiredCredits: Int? = null,
        val availableCredits: Int? = null
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

    private val _eventFlow = MutableSharedFlow<GenerationEvent>()
    val eventFlow: SharedFlow<GenerationEvent> = _eventFlow.asSharedFlow()

    private var currentIdempotencyKey: String? = null
    var onProfileRefreshRequested: (() -> Unit)? = null
    fun notificationOwner(): String? = account
    private var statusJob: Job? = null
    private var account: String? = null
    private var epoch = 0
    private val _focusedGenerationId = MutableStateFlow<String?>(null)
    val focusedGenerationId = _focusedGenerationId.asStateFlow()
    private var focusedId: String?
        get() = _focusedGenerationId.value
        set(value) { _focusedGenerationId.value = value }
    private var refreshing = false
    private val fetching = mutableSetOf<String>()
    private val jobs = mutableListOf<Job>()
    private val _operations = MutableStateFlow<List<com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration>>(emptyList())
    val operations = _operations.asStateFlow()

    fun bindAccount(owner: String?) {
        if (account == owner) return
        epoch++; account = owner
        jobs.forEach { it.cancel() }; jobs.clear(); fetching.clear(); refreshing = false
        _operations.value = emptyList(); resetState(); _selectedPhotos.value = emptyList()
    }

    fun setSelectedPhotos(uris: List<Uri>) { _selectedPhotos.value = uris }

    fun generateImage(styleId: String, isRetry: Boolean = false) {
        if (isRetry) { viewModelScope.launch { refreshOperations() }; return }
        startGeneration(styleId)
    }

    private fun startGeneration(styleId: String) {
        // Set the guard synchronously, before navigation or launching a coroutine.
        if (_uiState.value is GenerationUiState.Uploading || _uiState.value is GenerationUiState.Processing) return
        val owner = account ?: generationRepository.accountId() ?: return
        if (account != owner) bindAccount(owner)
        val photos = _selectedPhotos.value.toList()
        if (photos.isEmpty()) {
            _uiState.value = GenerationUiState.Error("No photos selected. Please select your photos."); return
        }
        val key = UUID.randomUUID().toString()
        if (!generationRepository.rememberPending(owner, key)) {
            _uiState.value = GenerationUiState.Error("Couldn't safely save this request. Please try again."); return
        }
        val ticket = epoch
        currentIdempotencyKey = key; focusedId = key
        _uiState.value = GenerationUiState.Uploading
        _statusMessage.value = "Uploading your photo..."
        upsert(com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration(key, styleId, status = "submitting"))
        jobs.removeAll { it.isCompleted }
        jobs += viewModelScope.launch {
            try {
                val response = generationRepository.generateImage(styleId, photos, key)
                if (ticket != epoch) return@launch
                response.fold(onSuccess = { body ->
                    val id = body.generationId ?: key
                    _operations.value = _operations.value.filterNot { it.id == key }
                    upsert(com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration(id, styleId, status = body.status ?: "completed"))
                    if (focusedId == key) {
                        focusedId = id
                        if (!body.image.isNullOrBlank()) _uiState.value = GenerationUiState.Success(body.image)
                        else { _uiState.value = GenerationUiState.Processing; _statusMessage.value = "Creating your photo..." }
                    }
                    onProfileRefreshRequested?.invoke()
                    refreshOperations()
                }, onFailure = { error ->
                    if (error is InsufficientCreditsException || (error !is AmbiguousOutcomeException && error !is DuplicateOperationException)) {
                        generationRepository.forgetPending(owner, key)
                        _operations.value = _operations.value.filterNot { it.id == key }
                        if (focusedId == key) _uiState.value = if (error is InsufficientCreditsException) {
                            GenerationUiState.Error("You need ${error.required} credits, but your balance is ${error.available}.", false,
                                requiredCredits = error.required, availableCredits = error.available)
                        } else GenerationUiState.Error(error.message ?: "Couldn't submit this photo.")
                    } else {
                        upsert(com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration(key, styleId, status = "checking"))
                        if (focusedId == key) { _uiState.value = GenerationUiState.Processing; _statusMessage.value = "Checking your generation. You can leave this screen safely." }
                    }
                    onProfileRefreshRequested?.invoke()
                })
            } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        }
    }

    private fun upsert(operation: com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration) {
        _operations.value = listOf(operation) + _operations.value.filterNot { it.id == operation.id }
    }

    suspend fun refreshOperations() {
        val owner = account ?: return
        if (refreshing) return
        refreshing = true
        val ticket = epoch
        try {
            val previousStatuses = _operations.value.associate { it.id to it.status }
            val response = generationRepository.operations()
            if (ticket != epoch || !response.isSuccessful) return
            val remote = response.body()?.items ?: return
            val pending = mutableListOf<com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration>()
            for (key in generationRepository.pendingKeys(owner)) {
                val found = generationRepository.operationByKey(key)
                if (ticket != epoch) return
                val operation = found.body()
                if (found.isSuccessful && operation != null) {
                    generationRepository.forgetPending(owner, key)
                    if (focusedId == key) focusedId = operation.id
                    // A viewed result need not reappear in the floating list.
                    if (remote.none { it.id == operation.id } && focusedId == operation.id) pending += operation
                } else if (found.code() == 404 && System.currentTimeMillis() - generationRepository.pendingSince(owner, key) >= 5 * 60_000L) {
                    generationRepository.forgetPending(owner, key)
                    if (focusedId == key) _uiState.value = GenerationUiState.Error("The server could not find this submission after repeated checks. No new generation was started. Check credit history or contact support if credits were deducted.", false)
                } else pending += com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration(key, status = "checking")
            }
            if (ticket != epoch) return
            _operations.value = (remote + pending).distinctBy { it.id }
            val focused = _operations.value.find { it.id == focusedId }
            if (focused != null && _uiState.value !is GenerationUiState.Success) {
                when (focused.status) {
                    "completed" -> if (focused.resultAvailable) loadResult(focused.id) else _uiState.value = GenerationUiState.Error("This photo's recovery copy is no longer available. Checking it did not charge credits.", false)
                    "failed" -> {
                        val reason = focused.failureReason
                        val message = if (reason?.contains("content policy", ignoreCase = true) == true) {
                            "We couldn't generate this photo because the image provider's safety checks didn't accept the request. " +
                                "This can relate to the photograph, the style prompt, or their combination.\n\n" +
                                "Your credits have been refunded. Please try a different, clear, well-lit photograph. " +
                                "If this keeps happening with this style, please contact support."
                        } else (reason ?: "Generation failed.") + " Reserved credits were refunded."
                        _uiState.value = GenerationUiState.Error(message, false)
                    }
                    "outcome_unknown" -> _uiState.value = GenerationUiState.Error((focused.failureReason ?: "The provider outcome is unconfirmed.") + " Your request is saved for review. Closing this reminder does not retry or refund it. Contact support with request " + focused.id, false, true)
                    "checking" -> { _uiState.value = GenerationUiState.Processing; _statusMessage.value = "Checking submission status. You can browse and return using the shortcut." }
                    else -> { _uiState.value = GenerationUiState.Processing; _statusMessage.value = "Creating your photo... You can browse while it finishes." }
                }
            }
            if (_uiState.value is GenerationUiState.Error) _statusMessage.value = "No new generation was started. Review the details above."
            if (remote.any { previousStatuses[it.id] != it.status }) onProfileRefreshRequested?.invoke()
        } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
        catch (_: Exception) { if (ticket == epoch && _uiState.value is GenerationUiState.Processing) _statusMessage.value = "Connection interrupted. Checking again shortly..." }
        finally { if (ticket == epoch) refreshing = false }
    }

    fun openOperation(id: String) {
        focusedId = id
        _selectedPhotos.value = emptyList()
        _uiState.value = GenerationUiState.Processing
        _statusMessage.value = "Checking your generation..."
        val ticket = epoch
        viewModelScope.launch {
            try {
                refreshOperations()
                if (ticket == epoch && focusedId == id && _uiState.value !is GenerationUiState.Success && _operations.value.none { it.id == id }) loadResult(id)
            } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (_: Exception) {
                if (ticket == epoch && focusedId == id) _uiState.value = GenerationUiState.Error("Couldn't check this photo. Check your connection and try again.", false, true)
            }
        }
    }

    private suspend fun loadResult(id: String) {
        if (!fetching.add(id)) return
        val ticket = epoch
        try {
            val response = generationRepository.result(id)
            if (ticket != epoch || focusedId != id) return
            val image = response.body()?.image
            if (response.isSuccessful && !image.isNullOrBlank()) {
                _uiState.value = GenerationUiState.Success(image)
            }
            else if (response.code() == 410) _uiState.value = GenerationUiState.Error("This photo's 24-hour recovery period has ended. Checking it did not charge credits.", false)
            else if (response.code() == 404) _uiState.value = GenerationUiState.Error("This generation is no longer available for this account.", false)
            else if (response.code() != 409) _uiState.value = GenerationUiState.Error("Couldn't retrieve this photo. Check your connection and check status again; this does not start a paid generation.", false, true)
        } catch (cancelled: kotlinx.coroutines.CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            if (ticket == epoch && focusedId == id) _uiState.value = GenerationUiState.Error(
                "Couldn't retrieve this photo. Check your connection and check status again; this does not start a paid generation.", false, true)
        } finally { if (ticket == epoch) fetching.remove(id) }
    }

    fun markFocusedViewed(expectedId: String? = focusedId) {
        val id = focusedId?.takeIf { it == expectedId } ?: return
        // A failed download must not hide a completed photo that is still recoverable.
        if (_uiState.value is GenerationUiState.Error && _operations.value.any {
            it.id == id && it.status == "completed" && it.resultAvailable
        }) return
        val ticket = epoch
        viewModelScope.launch {
            try {
                val response = generationRepository.viewed(id)
                if (ticket == epoch && response.isSuccessful) _operations.value = _operations.value.filterNot { it.id == id }
            } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (_: Exception) { /* Keep the shortcut until acknowledgement succeeds. */ }
        }
    }

    fun saveImageToGallery(context: Context): Boolean {
        val state = _uiState.value
        if (state !is GenerationUiState.Success || _isActionLoading.value) return false

        // Lock before launching work so rapid save taps cannot create duplicate files.
        _isActionLoading.value = true
        viewModelScope.launch {
          try {
            val bitmap = withContext(Dispatchers.IO) { ImageUtils.decodeBase64ToBitmap(state.imageBase64) }
            if (bitmap != null) {
              try {
                val result = ImageUtils.saveBitmapToGallery(context, bitmap)
                if (result.isSuccess) {
                    _eventFlow.emit(GenerationEvent.ShowSnackbar("Image saved to gallery!"))
                } else {
                    _eventFlow.emit(GenerationEvent.ShowSnackbar("Failed to save image: ${result.exceptionOrNull()?.message}"))
                }
              } finally { bitmap.recycle() }
            } else {
                _eventFlow.emit(GenerationEvent.ShowSnackbar("Failed to decode image for saving."))
            }
          } finally { _isActionLoading.value = false }
        }
        return true
    }

    fun shareImage(context: Context) {
        val state = _uiState.value
        if (state !is GenerationUiState.Success || _isActionLoading.value) return

        _isActionLoading.value = true
        viewModelScope.launch {
          try {
            val bitmap = withContext(Dispatchers.IO) { ImageUtils.decodeBase64ToBitmap(state.imageBase64) }
            if (bitmap != null) {
              try {
                val result = ImageUtils.shareImage(context, bitmap)
                if (result.isFailure) {
                    _eventFlow.emit(GenerationEvent.ShowSnackbar("Failed to share image: ${result.exceptionOrNull()?.message}"))
                }
              } finally { bitmap.recycle() }
            } else {
                _eventFlow.emit(GenerationEvent.ShowSnackbar("Failed to decode image for sharing."))
            }
          } finally { _isActionLoading.value = false }
        }
    }
    
    fun resetState() {
        statusJob?.cancel()
        _uiState.value = GenerationUiState.Idle
        _statusMessage.value = "Preparing your photo..."
        _isActionLoading.value = false
        currentIdempotencyKey = null
        focusedId = null
    }

    override fun onCleared() {
        statusJob?.cancel()
    }
}
