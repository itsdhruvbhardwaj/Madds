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
import com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration
import com.itsdhruvbhardwaj.picme.data.model.generationExpiry
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

data class GenerationGalleryState(
    val items: List<RecoverableGeneration> = emptyList(),
    val thumbnails: Map<String, java.io.File> = emptyMap(),
    val savedUris: Map<String, Uri> = emptyMap(),
    val nextCursor: String? = null,
    val loading: Boolean = false,
    val error: String? = null
)

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
        val availableCredits: Int? = null,
        val isExpired: Boolean = false
    ) : GenerationUiState
}

sealed interface GenerationEvent {
    data class ShowSnackbar(val message: String) : GenerationEvent
}

class GenerationViewModel(
    private val generationRepository: GenerationRepository,
    private val elapsedMillis: () -> Long = android.os.SystemClock::elapsedRealtime
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

    private val _savedResults = MutableStateFlow<Set<String>>(emptySet())
    private val savedPhotoRevisions = mutableMapOf<String, Long>()
    val savedResults = _savedResults.asStateFlow()
    private val _gallery = MutableStateFlow(GenerationGalleryState())
    val gallery = _gallery.asStateFlow()
    private val _focusedExpiry = MutableStateFlow<Long?>(null)
    val focusedExpiry = _focusedExpiry.asStateFlow()
    private var serverClockOffset = 0L
    private var serverTimeBase: Long? = null
    private var serverElapsedBase = 0L
    fun galleryNow() = serverTimeBase?.let { it + elapsedMillis() - serverElapsedBase } ?: System.currentTimeMillis()
    private fun syncClock(value: String?) { generationExpiry(value)?.let {
        serverTimeBase = it; serverElapsedBase = elapsedMillis()
        val candidate = it - System.currentTimeMillis()
        if (kotlin.math.abs(candidate - serverClockOffset) > 60_000) serverClockOffset = candidate
    } }
    private val thumbnailSlots = Semaphore(3)
    private val dismissedResults = mutableSetOf<String>()
    fun resultKey(image: String, id: String? = focusedId): String = "${account}:${id ?: image}"

    fun discardFocusedResult(expectedId: String?) {
        if (expectedId == null || focusedId != expectedId) return
        dismissedResults += expectedId
        _operations.value = _operations.value.filterNot { it.id == expectedId }
        markFocusedViewed(expectedId)
    }

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
    private val fetching = mutableMapOf<String, Any>()
    private var photoOpenJob: Job? = null
    private val jobs = mutableListOf<Job>()
    private val _operations = MutableStateFlow<List<com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration>>(emptyList())
    val operations = _operations.asStateFlow()

    fun bindAccount(owner: String?) {
        generationRepository.bindGallery(owner)
        if (account == owner) return
        epoch++; account = owner
        _gallery.value = GenerationGalleryState(); _focusedExpiry.value = null; serverClockOffset = 0; serverTimeBase = null
        _savedResults.value = emptySet(); savedPhotoRevisions.clear(); dismissedResults.clear()
        jobs.forEach { it.cancel() }; jobs.clear(); fetching.clear(); refreshing = false
        _operations.value = emptyList(); resetState(); _selectedPhotos.value = emptyList()
    }

    fun setSelectedPhotos(uris: List<Uri>) { _selectedPhotos.value = uris }

    suspend fun savedGalleryPhoto(id: String): Uri? {
        val owner = account ?: return null
        val ticket = epoch
        val revision = savedPhotoRevisions[id] ?: 0L
        val uri = try { generationRepository.savedUri(owner, id) }
            catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (_: Exception) { null }
        if (ticket != epoch) return null
        if ((savedPhotoRevisions[id] ?: 0L) != revision) return _gallery.value.savedUris[id]
        if (uri == null) return null
        _gallery.value = _gallery.value.copy(savedUris = _gallery.value.savedUris + (id to uri))
        _savedResults.value += resultKey("", id)
        return uri
    }

    fun focusSavedGalleryPhoto(id: String) {
        if (account == null) return
        photoOpenJob?.cancel(); photoOpenJob = null
        focusedId = id
        _focusedExpiry.value = null
        _uiState.value = GenerationUiState.Idle
    }

    fun forgetSavedGeneration(uri: Uri) {
        val owner = account ?: return
        _gallery.value.savedUris.filterValues { it.lastPathSegment == uri.lastPathSegment }.keys.forEach { id ->
            savedPhotoRevisions[id] = (savedPhotoRevisions[id] ?: 0L) + 1
            generationRepository.forgetSaved(owner, id)
            _savedResults.value -= resultKey("", id)
            _gallery.value = _gallery.value.copy(savedUris = _gallery.value.savedUris - id)
        }
    }

    fun refreshGallery(loadMore: Boolean = false) {
        val owner = account ?: return
        if (_gallery.value.loading) return
        val cursor = if (loadMore) _gallery.value.nextCursor ?: return else null
        val ticket = epoch
        _gallery.value = _gallery.value.copy(loading = true, error = null)
        jobs.removeAll { it.isCompleted }
        jobs += viewModelScope.launch {
            try {
                val response = generationRepository.gallery(cursor)
                if (ticket != epoch) return@launch
                val body = response.body()?.takeIf { response.isSuccessful }
                    ?: throw java.io.IOException("Couldn't load recent photos. Please try again.")
                syncClock(body.serverNow)
                val items = ((if (loadMore) _gallery.value.items else emptyList()) + body.items).distinctBy { it.id }
                _gallery.value = _gallery.value.copy(items = items, nextCursor = body.nextCursor,
                    savedUris = _gallery.value.savedUris.filterKeys { id -> items.any { it.id == id } },
                    thumbnails = _gallery.value.thumbnails.filterKeys { id -> items.any { it.id == id } })
                body.items.map { item -> async {
                    thumbnailSlots.withPermit {
                        val revision = savedPhotoRevisions[item.id] ?: 0L
                        val saved = generationRepository.savedUri(owner, item.id)
                        if (ticket != epoch || (savedPhotoRevisions[item.id] ?: 0L) != revision) return@withPermit
                        if (saved != null) {
                            _gallery.value = _gallery.value.copy(savedUris = _gallery.value.savedUris + (item.id to saved))
                            _savedResults.value += resultKey("", item.id)
                        } else {
                            _gallery.value = _gallery.value.copy(savedUris = _gallery.value.savedUris - item.id)
                            _savedResults.value -= resultKey("", item.id)
                            if (item.resultAvailable) {
                                val expiry = generationExpiry(item.resultExpiresAt) ?: return@withPermit
                                val thumbnail = try { kotlinx.coroutines.withTimeoutOrNull(10_000) {
                                    generationRepository.thumbnail(owner, item.id, expiry - serverClockOffset)
                                } }
                                    catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
                                    catch (_: Exception) { null }
                                if (ticket == epoch && thumbnail != null) _gallery.value = _gallery.value.copy(thumbnails = _gallery.value.thumbnails + (item.id to thumbnail))
                            }
                        }
                    }
                } }.awaitAll()
            } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (_: Exception) {
                if (ticket == epoch) _gallery.value = _gallery.value.copy(error = "Couldn't load recent photos. Check your connection and refresh.")
            } finally { if (ticket == epoch) _gallery.value = _gallery.value.copy(loading = false) }
        }
    }

    fun deleteTemporaryResult(context: Context, onDeleted: () -> Unit) {
        val id = focusedId ?: return
        val owner = account ?: return
        if (_isActionLoading.value) return
        val ticket = epoch
        _isActionLoading.value = true
        jobs += viewModelScope.launch {
            try {
                val response = generationRepository.deleteResult(id)
                if (ticket != epoch) return@launch
                if (response.isSuccessful || response.code() == 410 || response.code() == 404) {
                    dismissedResults += id
                    _operations.value = _operations.value.filterNot { it.id == id }
                    _gallery.value = _gallery.value.copy(items = _gallery.value.items.filterNot { it.id == id }, thumbnails = _gallery.value.thumbnails - id)
                    generationRepository.forgetThumbnail(owner, id)
                    runCatching { com.itsdhruvbhardwaj.picme.notifications.GenerationNotifications.imageDisplayed(context, owner, id) }
                    if (focusedId == id) { resetState(); onDeleted() }
                } else _eventFlow.emit(GenerationEvent.ShowSnackbar("Couldn't delete the temporary copy. Please try again."))
            } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (_: Exception) { if (ticket == epoch) _eventFlow.emit(GenerationEvent.ShowSnackbar("Couldn't delete the temporary copy. Check your connection and try again.")) }
            finally { if (ticket == epoch) _isActionLoading.value = false }
        }
    }

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
        _focusedExpiry.value = null
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
                        syncClock(body.serverNow)
                        _focusedExpiry.value = generationExpiry(body.resultExpiresAt)
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
            _operations.value = (remote + pending).distinctBy { it.id }.filterNot { it.id in dismissedResults }
            val focused = _operations.value.find { it.id == focusedId }
            if (focused != null) generationExpiry(focused.resultExpiresAt)?.let { _focusedExpiry.value = it }
            if (focused != null && _uiState.value !is GenerationUiState.Success) {
                when (focused.status) {
                    "completed" -> if (focused.resultAvailable) loadResult(focused.id) else _uiState.value = GenerationUiState.Error("This photo's temporary copy is no longer available. Photos already saved to your device stay in your gallery.", false, isExpired = true)
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
        _focusedExpiry.value = generationExpiry(_gallery.value.items.find { it.id == id }?.resultExpiresAt)
        _selectedPhotos.value = emptyList()
        _uiState.value = GenerationUiState.Processing
        _statusMessage.value = "Checking your generation..."
        val ticket = epoch
        viewModelScope.launch {
            try {
                try {
                    val metadata = generationRepository.details(id).body()
                    if (ticket != epoch || focusedId != id) return@launch
                    if (metadata != null) { syncClock(metadata.serverNow); _focusedExpiry.value = generationExpiry(metadata.resultExpiresAt) }
                } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
                catch (_: Exception) { /* Result retrieval remains authoritative on older servers. */ }
                refreshOperations()
                if (ticket == epoch && focusedId == id && _uiState.value !is GenerationUiState.Success && _operations.value.none { it.id == id }) loadResult(id)
            } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (_: Exception) {
                if (ticket == epoch && focusedId == id) _uiState.value = GenerationUiState.Error("Couldn't check this photo. Check your connection and try again.", false, true)
            }
        }
    }

    /** Completed gallery cards retrieve only their existing image, never a provider operation. */
    fun openCompletedPhoto(operation: RecoverableGeneration) {
        if (account == null || operation.status != "completed") return
        photoOpenJob?.cancel()
        focusedId = operation.id
        _focusedExpiry.value = generationExpiry(operation.resultExpiresAt)
        _selectedPhotos.value = emptyList()
        _uiState.value = GenerationUiState.Processing
        _statusMessage.value = "Opening your photo..."
        val ticket = epoch
        photoOpenJob = viewModelScope.launch {
            val retrieved = kotlinx.coroutines.withTimeoutOrNull(45_000) {
                loadResult(operation.id, replace = true)
                true
            }
            if (retrieved == null && ticket == epoch && focusedId == operation.id) {
                _uiState.value = GenerationUiState.Error("Couldn't open your photo in time. Check your connection and try again.", false, true)
            }
        }
    }

    private suspend fun loadResult(id: String, replace: Boolean = false) {
        if (!replace && fetching.containsKey(id)) return
        val request = Any()
        fetching[id] = request
        val ticket = epoch
        try {
            val response = generationRepository.result(id)
            if (ticket != epoch || focusedId != id || fetching[id] !== request) return
            val image = response.body()?.image
            if (response.isSuccessful && !image.isNullOrBlank()) {
                syncClock(response.body()?.serverNow)
                generationExpiry(response.body()?.resultExpiresAt)?.let { _focusedExpiry.value = it }
                val saved = account?.let { owner -> generationRepository.savedUri(owner, id) }
                if (ticket != epoch || focusedId != id || fetching[id] !== request) return
                if (saved != null) _savedResults.value += resultKey("", id)
                _uiState.value = GenerationUiState.Success(image)
            }
            else if (response.code() == 410) _uiState.value = GenerationUiState.Error("This photo's 24-hour availability has ended, or its temporary copy was deleted. Photos saved to your device stay in your gallery.", false, isExpired = true)
            else if (response.code() == 404) _uiState.value = GenerationUiState.Error("This generation is no longer available for this account.", false)
            else if (response.code() == 409 && replace) {
                val operation = runCatching { com.google.gson.Gson().fromJson(response.errorBody()?.string(), RecoverableGeneration::class.java) }
                    .getOrNull()?.takeIf { it.id == id }
                _uiState.value = when (operation?.status) {
                    "failed" -> GenerationUiState.Error(operation.failureReason ?: "This photo couldn't be generated. Check your credit history for details.", false)
                    "outcome_unknown" -> GenerationUiState.Error((operation.failureReason ?: "The generation outcome is unconfirmed.") + " Contact support with request $id.", false, true)
                    else -> GenerationUiState.Error("This photo is still finishing. Please check again shortly.", false, true)
                }
            }
            else if (response.code() != 409) _uiState.value = GenerationUiState.Error("Couldn't retrieve this photo. Check your connection and check status again; this does not start a paid generation.", false, true)
        } catch (cancelled: kotlinx.coroutines.CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            if (ticket == epoch && focusedId == id && fetching[id] === request) _uiState.value = GenerationUiState.Error(
                "Couldn't retrieve this photo. Check your connection and check status again; this does not start a paid generation.", false, true)
        } finally { if (fetching[id] === request) fetching.remove(id) }
    }

    fun markFocusedViewed(expectedId: String? = focusedId) {
        val id = focusedId?.takeIf { it == expectedId } ?: return
        // A failed download must not hide a completed photo that is still recoverable.
        if ((_uiState.value as? GenerationUiState.Error)?.isExpired != true && _uiState.value is GenerationUiState.Error && _operations.value.any {
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

    fun saveImageToGallery(context: Context, onComplete: (Boolean) -> Unit = {}): Boolean {
        val state = _uiState.value
        if (state !is GenerationUiState.Success || _isActionLoading.value) return false
        val key = resultKey(state.imageBase64)
        if (key in _savedResults.value) { onComplete(true); return false }
        if (_focusedExpiry.value?.let { it <= galleryNow() } == true) return false
        val owner = account
        val id = focusedId
        val ticket = epoch
        _isActionLoading.value = true
        viewModelScope.launch {
            var saved = false
            try {
                val bitmap = withContext(Dispatchers.IO) { ImageUtils.decodeBase64ToBitmap(state.imageBase64) }
                if (bitmap != null) {
                    try {
                        val uri = ImageUtils.saveBitmapToGallery(context, bitmap).getOrNull()
                        saved = uri != null
                        if (uri != null && owner != null && id != null) {
                            generationRepository.rememberSaved(owner, id, uri)
                            if (ticket == epoch) {
                                savedPhotoRevisions[id] = (savedPhotoRevisions[id] ?: 0L) + 1
                                _gallery.value = _gallery.value.copy(savedUris = _gallery.value.savedUris + (id to uri))
                            }
                        }
                    } finally { bitmap.recycle() }
                }
                if (saved && ticket == epoch) {
                    _savedResults.value = _savedResults.value + key
                    runCatching {
                        com.itsdhruvbhardwaj.picme.notifications.GenerationNotifications.imageDisplayed(context, owner, id)
                    }
                }
            } catch (cancelled: kotlinx.coroutines.CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                saved = false
            } finally {
                if (ticket == epoch) _isActionLoading.value = false
            }
            if (ticket != epoch) return@launch
            if (focusedId == id && _uiState.value == state) onComplete(saved)
            _eventFlow.emit(GenerationEvent.ShowSnackbar(
                if (saved) "Image saved to gallery!" else "Couldn't save your photo. Please try again."
            ))
        }
        return true
    }

    fun shareImage(context: Context) {
        val state = _uiState.value
        if (state !is GenerationUiState.Success || _isActionLoading.value) return
        if (_focusedExpiry.value?.let { it <= galleryNow() } == true && resultKey(state.imageBase64) !in _savedResults.value) return

        val ticket = epoch
        _isActionLoading.value = true
        viewModelScope.launch {
          try {
            val bitmap = withContext(Dispatchers.IO) { ImageUtils.decodeBase64ToBitmap(state.imageBase64) }
            if (bitmap != null) {
              try {
                if (ticket != epoch) return@launch
                val result = ImageUtils.shareImage(context, bitmap)
                if (result.isFailure) {
                    _eventFlow.emit(GenerationEvent.ShowSnackbar("Failed to share image: ${result.exceptionOrNull()?.message}"))
                }
              } finally { bitmap.recycle() }
            } else {
                _eventFlow.emit(GenerationEvent.ShowSnackbar("Failed to decode image for sharing."))
            }
          } finally { if (ticket == epoch) _isActionLoading.value = false }
        }
    }
    
    fun resetState() {
        photoOpenJob?.cancel(); photoOpenJob = null
        statusJob?.cancel()
        _uiState.value = GenerationUiState.Idle
        _statusMessage.value = "Preparing your photo..."
        _isActionLoading.value = false
        currentIdempotencyKey = null
        focusedId = null
        _focusedExpiry.value = null
    }

    override fun onCleared() {
        statusJob?.cancel()
    }
}
