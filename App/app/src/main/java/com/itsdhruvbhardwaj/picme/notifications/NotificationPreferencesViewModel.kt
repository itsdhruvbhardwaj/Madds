package com.itsdhruvbhardwaj.picme.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class NotificationPreferencesState(val userId: String? = null, val preferences: Map<String, Boolean> = emptyMap(),
    val loading: Boolean = false, val savingCategories: Set<String> = emptySet(), val error: String? = null) {
    val saving: Boolean get() = savingCategories.isNotEmpty()
}

class NotificationPreferencesViewModel(private val repository: PushPreferencesRepository) : ViewModel() {
    private val mutable = MutableStateFlow(NotificationPreferencesState())
    val state = mutable.asStateFlow()
    private var loadJob: Job? = null
    private val saveJobs = mutableMapOf<String, Job>()
    fun load(userId: String) {
        val current = mutable.value
        if (current.userId == userId && (current.loading || current.saving)) return
        loadJob?.cancel()
        if (current.userId != userId) {
            saveJobs.values.forEach { it.cancel() }; saveJobs.clear()
        }
        val visible = if (current.userId == userId) current.preferences else repository.cached(userId)
        mutable.value = NotificationPreferencesState(userId, visible, loading = true)
        loadJob = viewModelScope.launch {
            val result = repository.load(userId)
            if (mutable.value.userId != userId) return@launch
            mutable.value = mutable.value.copy(loading = false, preferences = result.getOrElse { visible + repository.cached(userId) }, error = result.exceptionOrNull()?.message)
        }
    }
    fun set(userId: String, category: PushCategory, enabled: Boolean) {
        val current = mutable.value
        if (current.userId != userId || category.key in current.savingCategories || current.loading) return
        val previous = current.preferences[category.key] == true
        mutable.value = current.copy(savingCategories = current.savingCategories + category.key, error = null,
            preferences = current.preferences + (category.key to enabled))
        saveJobs[category.key] = viewModelScope.launch {
            val result = repository.set(userId, category, enabled)
            if (mutable.value.userId != userId) return@launch
            val latest = mutable.value
            val remaining = latest.savingCategories - category.key
            val settled = result.getOrNull()?.let { latest.preferences + it } ?: (latest.preferences +
                (category.key to if (!enabled) false else (repository.cached(userId)[category.key] ?: previous)))
            // A response for one category must not erase another pending choice.
            mutable.value = latest.copy(savingCategories = remaining,
                preferences = settled + latest.preferences.filterKeys { it in remaining },
                error = result.exceptionOrNull()?.message ?: latest.error)
            saveJobs.remove(category.key)
        }
    }
}
