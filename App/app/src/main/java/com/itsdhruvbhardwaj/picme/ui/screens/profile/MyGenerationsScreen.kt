package com.itsdhruvbhardwaj.picme.ui.screens.profile

import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.collectAsState
import androidx.lifecycle.repeatOnLifecycle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import com.itsdhruvbhardwaj.picme.ui.components.PicMeCompactHeader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlin.math.hypot

private sealed interface GenerationsState {
    data object Loading : GenerationsState
    data class Loaded(val images: List<Uri>) : GenerationsState
    data class Failed(val message: String) : GenerationsState
}

@Composable
fun MyGenerationsScreen(
    onBackClick: () -> Unit,
    viewModel: com.itsdhruvbhardwaj.picme.ui.screens.create.GenerationViewModel,
    onSavePhoto: () -> Unit,
    onOpenGeneration: (com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration) -> Unit,
    requestedGenerationId: String? = null,
    onRequestedGenerationHandled: () -> Unit = {}
) {
    val gallery by viewModel.gallery.collectAsState()
    var now by remember { mutableStateOf(viewModel.galleryNow()) }
    val lifecycleOwner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    LaunchedEffect(lifecycleOwner, viewModel) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(androidx.lifecycle.Lifecycle.State.RESUMED) {
            viewModel.refreshGallery()
            var ticks = 0
            while (true) {
                kotlinx.coroutines.delay(1_000)
                now = viewModel.galleryNow()
                if (++ticks % 30 == 0 && viewModel.gallery.value.items.any { it.status == "processing" }) viewModel.refreshGallery()
            }
        }
    }
    val context = LocalContext.current
    var state by remember { mutableStateOf<GenerationsState>(GenerationsState.Loading) }
    var localLoading by remember { mutableStateOf(true) }
    var localRefresh by remember { mutableIntStateOf(0) }
    var selectedTemporary by remember { mutableStateOf<com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration?>(null) }
    var selectedImage by remember { mutableStateOf<Uri?>(null) }
    var selectedImageGenerationId by remember { mutableStateOf<String?>(null) }
    var selectedImageOwner by remember { mutableStateOf<String?>(null) }
    var savedImageAcknowledged by remember { mutableStateOf(false) }
    var imagePendingDelete by remember { mutableStateOf<Uri?>(null) }
    var deleteError by remember { mutableStateOf<String?>(null) }
    var selectedTab by rememberSaveable(viewModel.notificationOwner()) { mutableStateOf(GenerationGalleryTab.Unsaved) }
    val unsavedListState = rememberLazyListState()
    val savedListState = rememberLazyListState()
    val listState = if (selectedTab == GenerationGalleryTab.Unsaved) unsavedListState else savedListState

    fun openSavedPhoto(uri: Uri, id: String? = null) {
        selectedTab = GenerationGalleryTab.Saved
        selectedTemporary = null
        selectedImage = uri
        selectedImageGenerationId = id
        selectedImageOwner = viewModel.notificationOwner()
        savedImageAcknowledged = false
        if (id != null) viewModel.focusSavedGalleryPhoto(id) else viewModel.resetState()
    }

    fun closeSavedPhoto() {
        if (selectedImageOwner == viewModel.notificationOwner()) viewModel.resetState()
        selectedImage = null
        selectedImageGenerationId = null
        localRefresh++
    }

    LaunchedEffect(requestedGenerationId) {
        val id = requestedGenerationId ?: return@LaunchedEffect
        val owner = viewModel.notificationOwner() ?: return@LaunchedEffect
        val saved = viewModel.savedGalleryPhoto(id)
        if (owner != viewModel.notificationOwner()) return@LaunchedEffect
        if (saved != null) openSavedPhoto(saved, id)
        else {
            selectedImage = null
            selectedImageGenerationId = null
            val operation = (viewModel.gallery.value.items.find { it.id == id }
                ?: viewModel.operations.value.find { it.id == id }
                ?: com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration(id)).copy(status = "completed")
            selectedTab = GenerationGalleryTab.Unsaved
            selectedTemporary = operation
            viewModel.openCompletedPhoto(operation)
        }
        onRequestedGenerationHandled()
    }

    fun loadImages() {
        localRefresh++
        viewModel.refreshGallery()
    }

    LaunchedEffect(localRefresh) {
        localLoading = true
        try {
            state = try {
                GenerationsState.Loaded(withContext(Dispatchers.IO) { querySavedGenerations(context) })
            } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (error: SecurityException) {
                GenerationsState.Failed("Madds couldn't access saved images on this device.")
            } catch (_: Exception) {
                GenerationsState.Failed("Couldn't load saved images. Please try again.")
            }
        } finally { localLoading = false }
    }

    val refreshing = gallery.loading || localLoading
    val localImages = (state as? GenerationsState.Loaded)?.images.orEmpty()
    val unsavedEntries = generationGalleryEntries(gallery.items, gallery.savedUris, localImages, now, GenerationGalleryTab.Unsaved)
    val savedEntries = generationGalleryEntries(gallery.items, gallery.savedUris, localImages, now, GenerationGalleryTab.Saved)
    val entries = if (selectedTab == GenerationGalleryTab.Unsaved) unsavedEntries else savedEntries

    // A page can contain only photos already saved on this device. Look ahead
    // before claiming that there are no unsaved photos left.
    LaunchedEffect(selectedTab, unsavedEntries.isEmpty(), gallery.nextCursor, gallery.loading, gallery.error) {
        if (selectedTab == GenerationGalleryTab.Unsaved && unsavedEntries.isEmpty() &&
            gallery.nextCursor != null && !gallery.loading && gallery.error == null) {
            viewModel.refreshGallery(loadMore = true)
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            PicMeCompactHeader(
                title = "My Generations",
                onBackClick = onBackClick,
                actions = {
                    IconButton(onClick = { loadImages() }, enabled = !refreshing) {
                        if (refreshing) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                        else Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Refresh saved images",
                            tint = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = innerPadding.calculateTopPadding())
        ) {
            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(top = 8.dp, bottom = 112.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                if (selectedTab == GenerationGalleryTab.Unsaved) gallery.error?.let { message -> item {
                    Column(Modifier.padding(horizontal = 16.dp)) {
                        Text(message, color = MaterialTheme.colorScheme.error)
                        TextButton(onClick = { viewModel.refreshGallery() }) { Text("Retry recent photos") }
                    }
                } }
                if (selectedTab == GenerationGalleryTab.Saved) (state as? GenerationsState.Failed)?.let { failure -> item {
                    Text(failure.message, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = { loadImages() }) { Text("Retry saved photos") }
                } }
                itemsIndexed(entries.chunked(3), key = { _, group -> selectedTab.name + ":" + group.first().key }) { _, group ->
                    Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        group.forEach { entry ->
                            val operation = entry.operation
                            if (operation != null) {
                                TemporaryGenerationTile(operation, entry.savedUri ?: gallery.thumbnails[operation.id],
                                    entry.savedUri != null, now, Modifier.weight(1f)) {
                                    when {
                                        entry.savedUri != null -> openSavedPhoto(entry.savedUri, entry.generationId)
                                        operation.status == "completed" -> {
                                            selectedTemporary = operation
                                            viewModel.openCompletedPhoto(operation)
                                        }
                                        else -> onOpenGeneration(operation)
                                    }
                                }
                            } else entry.savedUri?.let { uri ->
                                GenerationTile(uri, Modifier.weight(1f).aspectRatio(5f / 7f)) { openSavedPhoto(it, entry.generationId) }
                            }
                        }
                        repeat(3 - group.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
                if (selectedTab == GenerationGalleryTab.Unsaved && gallery.nextCursor != null) item {
                    TextButton(onClick = { viewModel.refreshGallery(loadMore = true) }, enabled = !gallery.loading) { Text("Load more recent photos") }
                }
                val hasError = if (selectedTab == GenerationGalleryTab.Unsaved) gallery.error != null else state is GenerationsState.Failed
                val canShowEmpty = selectedTab == GenerationGalleryTab.Saved || gallery.nextCursor == null
                if (entries.isEmpty() && !refreshing && !hasError && canShowEmpty) item {
                    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(if (selectedTab == GenerationGalleryTab.Unsaved) "No unsaved photos" else "No saved photos yet",
                            style = MaterialTheme.typography.titleMedium)
                        Text(if (selectedTab == GenerationGalleryTab.Unsaved) "New creations stay here for 24 hours."
                            else "Save a photo to your gallery to see it here.",
                            Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                    }
                }
            }
            GenerationGalleryFilters(selectedTab, onSelect = { selectedTab = it },
                Modifier.align(Alignment.BottomCenter).padding(horizontal = 24.dp, vertical = 16.dp))
        }
    }

    selectedTemporary?.let { operation ->
        TemporaryGenerationViewer(
            operation = operation,
            preview = gallery.thumbnails[operation.id],
            viewModel = viewModel,
            onSavePhoto = onSavePhoto,
            onClose = {
                if (operation.id in viewModel.gallery.value.savedUris ||
                    viewModel.resultKey("", operation.id) in viewModel.savedResults.value) selectedTab = GenerationGalleryTab.Saved
                selectedTemporary = null
                viewModel.resetState()
                localRefresh++
            }
        )
    }

    val deviceImages = (gallery.savedUris.values.toList() + (state as? GenerationsState.Loaded)?.images.orEmpty()).distinctBy { it.lastPathSegment }
    val loadedImages = if (selectedImage != null && deviceImages.none { it.lastPathSegment == selectedImage?.lastPathSegment })
        listOfNotNull(selectedImage) + deviceImages else deviceImages
    val scope = rememberCoroutineScope()
    val pagerState = rememberPagerState { loadedImages.size }
    LaunchedEffect(selectedImage, loadedImages) {
        selectedImage?.let { uri ->
            val index = loadedImages.indexOfFirst { it.lastPathSegment == uri.lastPathSegment }
            if (index >= 0 && pagerState.currentPage != index) pagerState.scrollToPage(index)
        }
    }
    selectedImage?.let { imageUri ->
        Dialog(
            onDismissRequest = { closeSavedPhoto() },
            properties = DialogProperties(usePlatformDefaultWidth = false)
        ) {
            Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
                HorizontalPager(
                    state = pagerState,
                    modifier = Modifier.fillMaxSize(),
                    userScrollEnabled = true,
                    key = { page -> loadedImages.getOrNull(page)?.toString() ?: page }
                ) { page ->
                    loadedImages.getOrNull(page)?.let { uri ->
                        ZoomableGenerationImage(uri, Modifier.fillMaxSize(), onSuccess = {
                            val id = selectedImageGenerationId
                            val owner = selectedImageOwner
                            if (!savedImageAcknowledged && id != null && owner == viewModel.notificationOwner() &&
                                uri.lastPathSegment == selectedImage?.lastPathSegment) {
                                savedImageAcknowledged = true
                                scope.launch {
                                    withFrameNanos { }
                                    if (owner == viewModel.notificationOwner() && id == selectedImageGenerationId) {
                                        com.itsdhruvbhardwaj.picme.notifications.GenerationNotifications.imageDisplayed(context, owner, id)
                                        viewModel.markFocusedViewed(id)
                                    }
                                }
                            }
                        })
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth().align(Alignment.TopEnd)
                        .padding(horizontal = 8.dp, vertical = 28.dp),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { closeSavedPhoto() }) {
                        Icon(Icons.Default.Close, contentDescription = "Close image", tint = Color.White)
                    }
                }
                Row(
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 36.dp),
                    horizontalArrangement = Arrangement.spacedBy(36.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = {
                        loadedImages.getOrNull(pagerState.currentPage)?.let { shareImage(context, it) }
                    }) {
                        Icon(Icons.Default.Share, contentDescription = "Share image", tint = Color.White)
                    }
                    IconButton(onClick = {
                        loadedImages.getOrNull(pagerState.currentPage)?.let { imagePendingDelete = it }
                    }) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete image", tint = Color.White)
                    }
                }
            }
        }
    }

    imagePendingDelete?.let { uri ->
        AlertDialog(
            onDismissRequest = { imagePendingDelete = null },
            title = { Text("Delete this image?") },
            text = { Text("This will permanently remove the saved image from your device.") },
            confirmButton = {
                TextButton(onClick = {
                    imagePendingDelete = null
                    scope.launch {
                        val deleted = withContext(Dispatchers.IO) {
                            runCatching { context.contentResolver.delete(uri, null, null) > 0 }.getOrDefault(false)
                        }
                        if (deleted) {
                            viewModel.forgetSavedGeneration(uri)
                            val remaining = loadedImages.filterNot { it.lastPathSegment == uri.lastPathSegment }
                            state = GenerationsState.Loaded(remaining)
                            if (remaining.isEmpty()) closeSavedPhoto()
                            else {
                                val next = pagerState.currentPage.coerceAtMost(remaining.lastIndex)
                                selectedImage = remaining[next]
                                selectedImageGenerationId = null
                                viewModel.resetState()
                                scope.launch { pagerState.scrollToPage(next) }
                            }
                        } else {
                            deleteError = "Couldn't delete this image. Please try again."
                        }
                    }
                }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { imagePendingDelete = null }) { Text("Cancel") } }
        )
    }

    deleteError?.let { message ->
        AlertDialog(
            onDismissRequest = { deleteError = null },
            title = { Text("Couldn't delete image") },
            text = { Text(message) },
            confirmButton = { TextButton(onClick = { deleteError = null }) { Text("OK") } }
        )
    }
}

private fun shareImage(context: Context, uri: Uri) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "image/jpeg"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(intent, "Share image"))
}

@Composable
internal fun ZoomableGenerationImage(
    image: Any, modifier: Modifier = Modifier, privateImage: Boolean = false,
    onSuccess: () -> Unit = {}, onError: () -> Unit = {}
) {
    var scale by remember(image) { mutableStateOf(1f) }
    var offsetX by remember(image) { mutableStateOf(0f) }
    var offsetY by remember(image) { mutableStateOf(0f) }
    val scope = rememberCoroutineScope()
    var zoomAnimation by remember(image) { mutableStateOf<Job?>(null) }
    val context = LocalContext.current
    val request = remember(image, privateImage, context) {
        if (privateImage) coil.request.ImageRequest.Builder(context).data(image)
            .memoryCachePolicy(coil.request.CachePolicy.DISABLED)
            .diskCachePolicy(coil.request.CachePolicy.DISABLED).build() else image
    }
    val latestScale by rememberUpdatedState(scale)
    BoxWithConstraints(modifier = modifier) {
        val density = androidx.compose.ui.platform.LocalDensity.current
        val widthPx = with(density) { maxWidth.toPx() }
        val heightPx = with(density) { maxHeight.toPx() }
        AsyncImage(
            model = request,
            onSuccess = { onSuccess() },
            onError = { onError() },
            contentDescription = "Generated image preview",
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize()
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationX = offsetX
                    translationY = offsetY
                }
                .pointerInput(image) {
                    detectTapGestures(onDoubleTap = {
                        val targetScale = if (latestScale > 1.01f) 1f else 2.5f
                        zoomAnimation?.cancel()
                        zoomAnimation = scope.launch {
                            animate(
                                initialValue = latestScale,
                                targetValue = targetScale,
                                animationSpec = tween(durationMillis = 220)
                            ) { value, _ -> scale = value }
                            if (targetScale == 1f) {
                                offsetX = 0f
                                offsetY = 0f
                            }
                        }
                    })
                }
                .pointerInput(image, widthPx, heightPx) {
                    awaitEachGesture {
                        var previousCentroid: androidx.compose.ui.geometry.Offset? = null
                        var previousDistance = 0f
                        var panDistanceX = 0f
                        var panDistanceY = 0f
                        var panStarted = false
                        do {
                            val event = awaitPointerEvent(PointerEventPass.Main)
                            val pressed = event.changes.filter { it.pressed }
                            when {
                                    pressed.size >= 2 -> {
                                        val first = pressed[0].position
                                        val second = pressed[1].position
                                        val centroid = androidx.compose.ui.geometry.Offset(
                                            (first.x + second.x) / 2f,
                                            (first.y + second.y) / 2f
                                        )
                                        val distance = hypot(first.x - second.x, first.y - second.y)
                                        val previous = previousCentroid
                                        if (previous != null && previousDistance > 0f) {
                                            val factor = distance / previousDistance
                                            val newScale = (scale * factor).coerceIn(1f, 5f)
                                            offsetX = (offsetX + centroid.x - previous.x).coerceIn(
                                                -widthPx * (newScale - 1f) / 2f,
                                                widthPx * (newScale - 1f) / 2f
                                            )
                                            offsetY = (offsetY + centroid.y - previous.y).coerceIn(
                                                -heightPx * (newScale - 1f) / 2f,
                                                heightPx * (newScale - 1f) / 2f
                                            )
                                            zoomAnimation?.cancel()
                                            scale = newScale
                                            if (newScale == 1f) { offsetX = 0f; offsetY = 0f }
                                        }
                                        previousCentroid = centroid
                                        previousDistance = distance
                                        pressed.forEach { it.consume() }
                                    }
                                    pressed.size == 1 && scale > 1f -> {
                                        val change = pressed.first()
                                        val deltaX = change.position.x - change.previousPosition.x
                                        val deltaY = change.position.y - change.previousPosition.y
                                        panDistanceX += deltaX
                                        panDistanceY += deltaY
                                        if (!panStarted && hypot(panDistanceX, panDistanceY) > viewConfiguration.touchSlop) {
                                            panStarted = true
                                        }
                                        // Don't consume a tap or tiny finger jitter; once the
                                        // touch crosses slop, take over for image panning.
                                        if (panStarted) {
                                            offsetX = (offsetX + panDistanceX).coerceIn(
                                                -widthPx * (scale - 1f) / 2f,
                                                widthPx * (scale - 1f) / 2f
                                            )
                                            offsetY = (offsetY + panDistanceY).coerceIn(
                                                -heightPx * (scale - 1f) / 2f,
                                                heightPx * (scale - 1f) / 2f
                                            )
                                            panDistanceX = 0f
                                            panDistanceY = 0f
                                            change.consume()
                                        }
                                    }
                            }
                        } while (event.changes.any { it.pressed })
                    }
                }
        )
    }
}

private fun querySavedGenerations(context: Context): List<Uri> {
    val resolver = context.contentResolver
    val collection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    val projection = arrayOf(MediaStore.Images.Media._ID)
    val selection: String
    val selectionArgs: Array<String>
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        selection = "${MediaStore.Images.Media.RELATIVE_PATH} = ?"
        selectionArgs = arrayOf("${Environment.DIRECTORY_PICTURES}/PicMe/")
    } else {
        selection = "${MediaStore.Images.Media.DISPLAY_NAME} LIKE ?"
        selectionArgs = arrayOf("PicMe_%")
    }

    val images = mutableListOf<Uri>()
    resolver.query(
        collection,
        projection,
        selection,
        selectionArgs,
        "${MediaStore.Images.Media.DATE_ADDED} DESC"
    )?.use { cursor ->
        val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
        while (cursor.moveToNext()) {
            images += ContentUris.withAppendedId(collection, cursor.getLong(idColumn))
        }
    }
    return images
}

@Composable
private fun GenerationTile(image: Uri, modifier: Modifier, onImageClick: (Uri) -> Unit) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable { onImageClick(image) }
    ) {
        AsyncImage(
            model = image,
            contentDescription = "Saved generated image",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )
    }
}

@Composable
private fun TemporaryGenerationTile(
    item: com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration,
    image: Any?, saved: Boolean, now: Long, modifier: Modifier, onClick: () -> Unit
) {
    Box(modifier.aspectRatio(5f / 7f).clip(RoundedCornerShape(8.dp))
        .background(MaterialTheme.colorScheme.surfaceVariant).clickable(onClick = onClick)) {
        if (image != null) AsyncImage(
            model = coil.request.ImageRequest.Builder(LocalContext.current).data(image)
                .diskCachePolicy(coil.request.CachePolicy.DISABLED).memoryCachePolicy(coil.request.CachePolicy.DISABLED).build(),
            contentDescription = item.styleName, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        else Text(if (item.status == "processing") "Generating…" else "Tap to open photo",
            Modifier.align(Alignment.Center).padding(16.dp), textAlign = TextAlign.Center)
        val label = if (saved) null else if (item.status == "processing") "Generating…" else {
            val expiry = com.itsdhruvbhardwaj.picme.data.model.generationExpiry(item.resultExpiresAt) ?: now
            "◷ " + com.itsdhruvbhardwaj.picme.data.model.generationTimeLeft(expiry, now)
        }
        if (label != null) Text(label, Modifier.align(Alignment.TopStart).padding(4.dp)
            .background(Color.Black.copy(alpha = 0.75f), RoundedCornerShape(6.dp)).padding(4.dp),
            color = Color.White, style = MaterialTheme.typography.labelSmall,
            maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(item.styleName, Modifier.align(Alignment.BottomStart).fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.65f)).padding(5.dp), color = Color.White,
            style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
