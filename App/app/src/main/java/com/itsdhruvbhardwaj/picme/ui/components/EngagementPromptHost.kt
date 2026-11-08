package com.itsdhruvbhardwaj.picme.ui.components

import android.os.SystemClock
import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.itsdhruvbhardwaj.picme.data.local.*
import com.itsdhruvbhardwaj.picme.data.model.*
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.utils.SupportLinks
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/** Usage ticks stay on-device; only an eligible, quiet Home screen makes a claim request. */
@Composable
fun EngagementPromptHost(
    user: User?, authViewModel: AuthViewModel,
    safeToPrompt: () -> Boolean,
    homeActive: Boolean,
    onOverlayChanged: (Boolean) -> Unit,
    onFeedback: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val store = remember { EngagementStore(context) }
    val scope = rememberCoroutineScope()
    val userId = user?.id
    val safe by rememberUpdatedState(safeToPrompt)
    val overlay by rememberUpdatedState(onOverlayChanged)
    var promptId by remember(userId) { mutableStateOf<String?>(null) }
    var claiming by remember(userId) { mutableStateOf(false) }
    var responding by remember(userId) { mutableStateOf(false) }
    DisposableEffect(userId) { onDispose { overlay(false) } }
    LaunchedEffect(promptId, claiming) { overlay(promptId != null || claiming) }

    suspend fun flushResponse(owner: String) {
        val state = store.read(owner)
        val id = state.responsePrompt ?: return
        val action = state.responseAction ?: return
        val result = authViewModel.respondEngagementPrompt(owner, EngagementResponseRequest(id, action))
        if (result.getOrNull() == true) store.change(owner) {
            if (it.responsePrompt == id && it.responseAction == action) it.copy(responsePrompt = null, responseAction = null) else it
        }
    }
    LaunchedEffect(userId, lifecycleOwner) {
        val owner = userId ?: return@LaunchedEffect
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            val start = SystemClock.elapsedRealtime()
            val sessionId = AppEngagementSession.clock.resume(start)
            store.change(owner) { it.beginSession(sessionId) }
            var lastRecorded = start
            try {
                // Retry a locally saved dismissal/opt-out once when returning, not on every tick.
                flushResponse(owner)
                while (true) {
                    val elapsed = SystemClock.elapsedRealtime()
                    store.change(owner) { it.addUsage(elapsed - lastRecorded) }
                    lastRecorded = elapsed
                    val now = System.currentTimeMillis()
                    val progress = store.read(owner)
                    if (progress.stopped || progress.prompts >= 2) break
                    if (promptId == null && !claiming && progress.eligible(now) && safe()) {
                        val requestId = progress.pendingClaim ?: UUID.randomUUID().toString()
                        if (progress.pendingClaim == null && !store.durableChange(owner) { it.copy(pendingClaim = requestId) }) {
                            store.change(owner) { it.copy(nextCheckAt = now + 15 * 60000) }
                            delay(15_000)
                            continue
                        }
                        claiming = true
                        overlay(true)
                        try {
                            val response = authViewModel.claimEngagementPrompt(owner, EngagementClaimRequest(requestId)).getOrNull()
                            if (response == null) {
                                store.change(owner) { it.copy(nextCheckAt = now + 15 * 60000) }
                            } else {
                                val serverNext = response.nextPromptAt?.let { value -> runCatching {
                                    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.parse(value)?.time
                                }.getOrNull() }
                                if (response.eligible && response.promptId == requestId) {
                                    // Persist consumption before rendering, so process recreation cannot replay the same prompt.
                                    val consumed = store.durableChange(owner) { it.copy(prompts = (it.prompts + 1).coerceAtMost(2), pendingClaim = null,
                                        nextCheckAt = serverNext ?: now + ENGAGEMENT_WEEK_MS) }
                                    if (consumed && safe()) promptId = requestId
                                } else store.change(owner) { it.copy(pendingClaim = null, stopped = it.stopped || response.stopped,
                                    nextCheckAt = maxOf(serverNext ?: 0, now + 15 * 60000)) }
                            }
                        } finally { claiming = false; overlay(promptId != null) }
                    }
                    delay(15_000)
                }
            } finally {
                val end = SystemClock.elapsedRealtime()
                store.change(owner) { it.addUsage(end - lastRecorded) }
                AppEngagementSession.clock.pause(end)
                claiming = false
            }
        }
    }
    fun respond(action: String) {
        val owner = userId ?: return
        val id = promptId ?: return
        if (responding) return
        responding = true
        store.durableChange(owner) { it.respond(id, action, System.currentTimeMillis()) }
        promptId = null
        if (action == "FEEDBACK") onFeedback()
        scope.launch {
            try { flushResponse(owner) }
            catch (cancelled: CancellationException) { throw cancelled }
            finally { responding = false }
        }
    }
    LaunchedEffect(homeActive) { if (!homeActive && promptId != null) respond("DISMISS") }
    if (promptId != null) {
        AlertDialog(
            onDismissRequest = { respond("DISMISS") },
            title = { Text("Help us improve") },
            text = { Text("Share your experience with Madds or tell us what we can do better.") },
            confirmButton = {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Button(onClick = {
                        if (SupportLinks.openRating(context)) respond("RATE")
                        else Toast.makeText(context, "Couldn't open Google Play. Please try again.", Toast.LENGTH_SHORT).show()
                    }, enabled = !responding, modifier = Modifier.fillMaxWidth()) { Text("Rate on Play Store") }
                    OutlinedButton(onClick = { respond("FEEDBACK") }, enabled = !responding, modifier = Modifier.fillMaxWidth()) { Text("Send feedback") }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton(onClick = { respond("DISMISS") }, enabled = !responding, modifier = Modifier.weight(1f)) { Text("Not now") }
                        TextButton(onClick = { respond("OPT_OUT") }, enabled = !responding, modifier = Modifier.weight(1f)) { Text("Don't ask again") }
                    }
                }
            }
        )
    }
}
