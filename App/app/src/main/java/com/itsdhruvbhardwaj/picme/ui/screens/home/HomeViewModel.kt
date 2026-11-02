package com.itsdhruvbhardwaj.picme.ui.screens.home

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.itsdhruvbhardwaj.picme.data.model.HomeConfigResponse
import com.itsdhruvbhardwaj.picme.data.model.HomeSection
import com.itsdhruvbhardwaj.picme.data.model.Style
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withTimeout

data class HomeSectionData(
    val config: HomeSection,
    val styles: List<Style>? = null,
    val error: String? = null
)

sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Success(val sections: List<HomeSectionData>, val refreshError: String? = null) : HomeUiState
    data class Error(val message: String) : HomeUiState
}

class HomeViewModel(private val styleRepository: StyleRepository) : ViewModel() {
    private val cachedHome = styleRepository.getCachedHome()
    private val _uiState = MutableStateFlow<HomeUiState>(cachedHome?.let { feed ->
        HomeUiState.Success(feed.sections.filter { it.visible && !it.styles.isNullOrEmpty() }
            .sortedBy { it.order }.map { HomeSectionData(it, it.styles) })
    } ?: HomeUiState.Loading)
    val uiState = _uiState.asStateFlow()
    private var loadJob: Job? = null

    init { loadHomeData() }

    fun loadHomeData(): Job {
        loadJob?.cancel()
        return viewModelScope.launch {
            val previous = (_uiState.value as? HomeUiState.Success)?.sections.orEmpty()
            if (_uiState.value !is HomeUiState.Success) _uiState.value = HomeUiState.Loading
            try {
                withTimeout(40_000) {
                    val feed = styleRepository.getHomeConfig().getOrThrow()
                    val visible = feed.sections.filter { it.visible }.sortedBy { it.order }
                    Log.d("PicMeHome", "Loading ${visible.size} sections; bundled=${visible.all { it.styles != null }}")
                    _uiState.value = HomeUiState.Success(visible.map { config ->
                        HomeSectionData(config, config.styles ?: previous.find { it.config.id == config.id }?.styles)
                    })
                    // Compatibility with older servers: bounded concurrency, never 17 simultaneous calls.
                    val permits = Semaphore(3)
                    coroutineScope {
                        visible.filter { it.styles == null }.forEach { config ->
                            launch { permits.withPermit { loadSection(config) } }
                        }
                    }
                    val state = _uiState.value as? HomeUiState.Success ?: return@withTimeout
                    val populated = state.sections.filter { !it.styles.isNullOrEmpty() || it.error != null }
                    _uiState.value = state.copy(sections = populated)
                    styleRepository.saveHomeCache(HomeConfigResponse(populated.filter { it.error == null }.map {
                        it.config.copy(styles = it.styles)
                    }))
                }
            } catch (_: TimeoutCancellationException) {
                showFailure("Home took too long to load. Pull down or tap Retry to try again.")
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                Log.w("PicMeHome", "Home load failed", error)
                showFailure(when (error.message) {
                    "timeout" -> "Connection timed out. Pull down or tap Retry to try again."
                    "network_error" -> "Unable to connect. Check your internet and try again."
                    "session_expired" -> "Your session expired. Please sign in again."
                    else -> "Couldn't refresh Home. Pull down or tap Retry to try again."
                })
            }
        }.also { loadJob = it }
    }

    private suspend fun loadSection(config: HomeSection) {
        val result = styleRepository.getStyles(page = 1, limit = 10, collection = config.slug)
        _uiState.update { current ->
            if (current !is HomeUiState.Success) current else current.copy(sections = current.sections.map { section ->
                if (section.config.id != config.id) section
                else result.fold(
                    onSuccess = { section.copy(styles = it.styles, error = null) },
                    onFailure = { section.copy(styles = section.styles ?: emptyList(), error = "Couldn't refresh this section.") }
                )
            })
        }
    }

    private fun showFailure(message: String) {
        val current = _uiState.value as? HomeUiState.Success
        _uiState.value = if (current != null && current.sections.any { !it.styles.isNullOrEmpty() }) {
            current.copy(refreshError = message, sections = current.sections.map {
                if (it.styles == null) it.copy(styles = emptyList(), error = "Couldn't load this section.") else it
            })
        } else HomeUiState.Error(message)
    }
}
