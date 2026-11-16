package com.itsdhruvbhardwaj.picme.ui.screens.home

import android.os.SystemClock
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.model.*
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DailyRewardUiState(
    val offer: DailyRewardStatus? = null, val loading: Boolean = false, val claiming: Boolean = false,
    val popup: Boolean = false, val error: String? = null
) {
    val available: Boolean get() = offer?.validOffer == true
    val blocksOtherPrompts: Boolean get() = loading || claiming || popup
}
data class DailyRewardClaimed(val userId: String, val dayKey: String, val confirmedAt: Long)
class DailyRewardViewModel(
    private val load: suspend (String) -> Result<DailyRewardStatus>,
    private val claim: suspend (String, DailyRewardClaimRequest) -> Result<DailyRewardClaimResponse>,
    private val elapsed: () -> Long = SystemClock::elapsedRealtime
) : ViewModel() {
    private val _state = MutableStateFlow(DailyRewardUiState())
    val state = _state.asStateFlow()
    private val _claimCompletions = MutableSharedFlow<DailyRewardClaimed>(extraBufferCapacity = 1)
    // No replay: returning from another screen or the background must never produce a late ad.
    val claimCompletions = _claimCompletions.asSharedFlow()
    private var owner: String? = null
    private var foreground = false
    private var visit = 0L
    private var checkedVisit = -1L
    private var shownDay: String? = null
    private var shownVisit = -1L
    private var resetAt = Long.MAX_VALUE
    private var retryAt = Long.MAX_VALUE
    private var failures = 0
    private var epoch = 0L
    private var loadJob: Job? = null
    private var claimJob: Job? = null

    fun bindAccount(id: String?) {
        if (owner == id) return
        ++epoch; owner = id; loadJob?.cancel(); claimJob?.cancel()
        checkedVisit = -1; shownDay = null; shownVisit = -1; resetAt = Long.MAX_VALUE; retryAt = Long.MAX_VALUE; failures = 0
        _state.value = DailyRewardUiState()
    }
    fun beginVisit() { if (!foreground) { foreground = true; ++visit; checkedVisit = -1; failures = 0; retryAt = Long.MAX_VALUE } }
    fun endVisit() { foreground = false; _state.value = _state.value.copy(popup = false) }
    private fun accept(status: DailyRewardStatus) {
        failures = 0; retryAt = Long.MAX_VALUE
        resetAt = elapsed() + (status.nextResetAt - status.serverTime).coerceIn(0, 86400000)
        _state.value = _state.value.copy(offer = status, loading = false, popup = if (status.validOffer) _state.value.popup else false)
    }
    fun checkVisit(safeToPrompt: Boolean) {
        if (owner == null || !foreground || _state.value.claiming) return
        val expired = elapsed() >= resetAt
        if (!expired && checkedVisit == visit && elapsed() < retryAt) { considerPopup(safeToPrompt); return }
        if (loadJob?.isActive == true) return
        val id = owner!!; val requestEpoch = epoch; val requestVisit = visit
        // Clear expired cards before checking the new server day.
        _state.value = _state.value.copy(loading = true, error = null, offer = if (expired) null else _state.value.offer)
        loadJob = viewModelScope.launch {
            try {
                val result = load(id)
                if (requestEpoch != epoch || requestVisit != visit || !foreground) return@launch
                checkedVisit = requestVisit
                result.fold(onSuccess = { accept(it) }, onFailure = {
                    retryAt = if (failures < 3) elapsed() + listOf(5000L, 15000L, 30000L)[failures++] else Long.MAX_VALUE
                    resetAt = Long.MAX_VALUE
                    _state.value = DailyRewardUiState()
                })
            } finally { if (requestEpoch == epoch && _state.value.loading) _state.value = _state.value.copy(loading = false) }
        }
    }
    fun considerPopup(safe: Boolean) {
        val offer = _state.value.offer ?: return
        if (safe && foreground && offer.validOffer && !_state.value.loading && !_state.value.claiming &&
            (shownVisit != visit || shownDay != offer.dayKey)) {
            shownVisit = visit; shownDay = offer.dayKey; _state.value = _state.value.copy(popup = true)
        }
    }
    fun dismiss() { if (!_state.value.claiming) _state.value = _state.value.copy(popup = false, error = null) }
    fun reminderOpened() {
        if (_state.value.claiming) return
        ++epoch; loadJob?.cancel(); loadJob = null; checkedVisit = -1; shownVisit = -1; shownDay = null
        _state.value = DailyRewardUiState()
    }
    fun claimBonus() {
        val offer = _state.value.offer?.takeIf { it.validOffer } ?: return
        val id = owner ?: return
        if (_state.value.claiming || _state.value.loading) return
        val requestEpoch = epoch
        _state.value = _state.value.copy(claiming = true, error = null)
        claimJob = viewModelScope.launch {
            var newClaimDay: String? = null
            try {
                val result = claim(id, DailyRewardClaimRequest(offer.dayKey, offer.revision))
                if (requestEpoch != epoch) return@launch
                val confirmed = result.getOrNull()?.takeIf { it.confirmed }
                if (confirmed != null) {
                    accept(offer.copy(claimed = true, eligible = false, dayKey = confirmed.dayKey,
                        serverTime = confirmed.serverTime, nextResetAt = confirmed.nextResetAt))
                    _state.value = _state.value.copy(popup = false, error = null)
                    if (confirmed.status == "claimed") newClaimDay = confirmed.dayKey
                } else {
                    // Reconcile a lost response, changed offer or claim from another device.
                    val reconciled = load(id).getOrNull()
                    if (requestEpoch != epoch) return@launch
                    if (reconciled != null) accept(reconciled)
                    _state.value = _state.value.copy(error = when {
                        reconciled?.claimed == true || reconciled?.enabled == false -> null
                        reconciled?.validOffer == true && reconciled.dayKey != offer.dayKey -> "A new reward day has started. Review today's bonus and claim again."
                        reconciled?.validOffer == true && reconciled.revision != offer.revision -> "Your daily bonus is now ${reconciled.credits} credits. Review it and tap Claim again."
                        else -> "Couldn't confirm your daily bonus. Check your connection and try again. You won't be credited twice."
                    })
                }
            } finally {
                if (requestEpoch == epoch) {
                    _state.value = _state.value.copy(claiming = false)
                    newClaimDay?.let { _claimCompletions.tryEmit(DailyRewardClaimed(id, it, elapsed())) }
                }
            }
        }
    }
}
