package com.itsdhruvbhardwaj.picme.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.request.CachePolicy
import coil.request.ImageRequest
import com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration
import com.itsdhruvbhardwaj.picme.data.model.generationTimeLeft
import com.itsdhruvbhardwaj.picme.notifications.GenerationNotifications
import com.itsdhruvbhardwaj.picme.ui.screens.create.GenerationEvent
import com.itsdhruvbhardwaj.picme.ui.screens.create.GenerationUiState
import com.itsdhruvbhardwaj.picme.ui.screens.create.GenerationViewModel
import com.itsdhruvbhardwaj.picme.utils.ImageUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.withContext
import java.io.File

/** The gallery opens a viewer immediately; fetching a stored photo is not generation. */
@Composable
internal fun TemporaryGenerationViewer(
    operation: RecoverableGeneration,
    preview: File?,
    viewModel: GenerationViewModel,
    onSavePhoto: () -> Unit,
    onClose: () -> Unit
) {
    val context = LocalContext.current
    val state by viewModel.uiState.collectAsState()
    val focusedId by viewModel.focusedGenerationId.collectAsState()
    val busy by viewModel.isActionLoading.collectAsState()
    val savedResults by viewModel.savedResults.collectAsState()
    val expiry by viewModel.focusedExpiry.collectAsState()
    val owner = remember(operation.id) { viewModel.notificationOwner() }
    val saved = viewModel.resultKey("", operation.id) in savedResults
    val image = (state as? GenerationUiState.Success)?.imageBase64.takeIf { focusedId == operation.id }
    val decoded by produceState<Pair<String, ByteArray?>?>(null, image) {
        value = image?.let { it to withContext(Dispatchers.Default) { ImageUtils.decodeBase64ToBytes(it) } }
    }
    val bytes = decoded?.takeIf { it.first == image }?.second
    val invalidBytes = image != null && decoded?.first == image && bytes == null
    var displayed by remember(image) { mutableStateOf(false) }
    var decodeFailed by remember(image) { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var now by remember { mutableStateOf(viewModel.galleryNow()) }
    val snackbar = remember { SnackbarHostState() }
    val error = state as? GenerationUiState.Error
    val expired = error?.isExpired == true || (!saved && expiry?.let { it <= now } == true)
    val retry: () -> Unit = { viewModel.openCompletedPhoto(operation) }

    LaunchedEffect(operation.id) {
        while (true) { now = viewModel.galleryNow(); delay(1_000) }
    }
    LaunchedEffect(Unit) {
        viewModel.eventFlow.collectLatest { event ->
            if (event is GenerationEvent.ShowSnackbar) snackbar.showSnackbar(event.message)
        }
    }
    LaunchedEffect(displayed, expired) {
        if (displayed || expired) {
            if (displayed) withFrameNanos { }
            GenerationNotifications.imageDisplayed(context, owner, operation.id)
            viewModel.markFocusedViewed(operation.id)
        }
    }

    Dialog(
        onDismissRequest = { if (!busy) onClose() },
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            val photoModifier = Modifier.fillMaxSize().padding(top = 64.dp, bottom = 96.dp)
            if (!expired) {
                if (!displayed && preview != null) AsyncImage(
                    model = ImageRequest.Builder(context).data(preview)
                        .diskCachePolicy(CachePolicy.DISABLED).memoryCachePolicy(CachePolicy.DISABLED).build(),
                    contentDescription = "Photo preview", contentScale = ContentScale.Fit, modifier = photoModifier)
                bytes?.let { photo ->
                    ZoomableGenerationImage(photo, photoModifier, privateImage = true,
                        onSuccess = { displayed = true; decodeFailed = false },
                        onError = { decodeFailed = true })
                }
            }

            when {
                expired -> ViewerMessage("This photo's temporary copy is no longer available. Photos saved to your device stay in your gallery.")
                error != null -> ViewerMessage(error.message, retry)
                decodeFailed || invalidBytes -> ViewerMessage("Couldn't display this photo. Please try opening it again.", retry)
                !displayed -> Column(
                    Modifier.align(Alignment.Center).background(Color.Black.copy(alpha = 0.75f), MaterialTheme.shapes.medium).padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
                    Text("Opening photo…", Modifier.padding(top = 10.dp), color = Color.White)
                }
            }

            Row(Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically) {
                Text(if (saved) "" else if (expired) "Photo unavailable"
                    else expiry?.let { generationTimeLeft(it, now) }.orEmpty(),
                    Modifier.weight(1f), color = Color.White, style = MaterialTheme.typography.labelMedium)
                IconButton(onClick = onClose, enabled = !busy) {
                    Icon(Icons.Default.Close, "Close photo", tint = Color.White)
                }
            }

            if (!expired) Row(
                Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(20.dp), verticalAlignment = Alignment.CenterVertically
            ) {
                Button(onClick = onSavePhoto, enabled = displayed && !busy && !saved) {
                    Icon(Icons.Default.Download, contentDescription = null)
                    Spacer(Modifier.width(6.dp))
                    Text(if (saved) "Saved" else if (busy) "Please wait…" else "Save")
                }
                IconButton(onClick = { viewModel.shareImage(context) }, enabled = displayed && !busy) {
                    Icon(Icons.Default.Share, "Share photo", tint = Color.White)
                }
                IconButton(onClick = { confirmDelete = true }, enabled = !busy) {
                    Icon(Icons.Default.Delete, "Delete temporary copy", tint = Color.White)
                }
            }
            SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 84.dp))
        }
    }

    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Delete temporary copy?") },
        text = { Text("This removes the photo from recent generations. A copy already saved to your device will stay in your gallery.") },
        confirmButton = { TextButton(enabled = !busy, onClick = {
            confirmDelete = false
            viewModel.deleteTemporaryResult(context, onClose)
        }) { Text("Delete") } },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } }
    )
}

@Composable
private fun BoxScope.ViewerMessage(message: String, retry: (() -> Unit)? = null) {
    Column(Modifier.align(Alignment.Center).padding(24.dp)
        .background(Color.Black.copy(alpha = 0.9f), MaterialTheme.shapes.medium).padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally) {
        Text(message, color = Color.White)
        if (retry != null) TextButton(onClick = retry) { Text("Retry opening photo") }
    }
}
