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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
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
fun MyGenerationsScreen(onBackClick: () -> Unit) {
    val context = LocalContext.current
    var state by remember { mutableStateOf<GenerationsState>(GenerationsState.Loading) }
    var selectedImage by remember { mutableStateOf<Uri?>(null) }
    var imagePendingDelete by remember { mutableStateOf<Uri?>(null) }
    var deleteError by remember { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()

    fun loadImages() {
        state = GenerationsState.Loading
    }

    LaunchedEffect(state) {
        if (state == GenerationsState.Loading) {
            state = try {
                GenerationsState.Loaded(withContext(Dispatchers.IO) { querySavedGenerations(context) })
            } catch (error: SecurityException) {
                GenerationsState.Failed("Madds couldn't access saved images on this device.")
            } catch (_: Exception) {
                GenerationsState.Failed("Couldn't load saved images. Please try again.")
            }
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            PicMeCompactHeader(
                title = "My Generations",
                onBackClick = onBackClick,
                actions = {
                    IconButton(onClick = { loadImages() }) {
                        Icon(
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
            when (val current = state) {
                GenerationsState.Loading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                is GenerationsState.Failed -> Column(
                    modifier = Modifier.align(Alignment.Center).padding(horizontal = 28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(current.message, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(12.dp))
                    androidx.compose.material3.TextButton(onClick = { loadImages() }) { Text("Try again") }
                }
                is GenerationsState.Loaded -> if (current.images.isEmpty()) {
                    Column(
                        modifier = Modifier.align(Alignment.Center).padding(horizontal = 32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text("No saved generations yet", style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(8.dp))
                        Text(
                            "Save a generated image to your device and it will appear here.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center
                        )
                    }
                } else {
                    LazyColumn(
                        state = listState,
                        contentPadding = PaddingValues(bottom = 112.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        itemsIndexed(current.images.chunked(6), key = { _, group -> group.first().toString() }) { index, group ->
                            GenerationsMosaic(group, index) { selectedImage = it }
                        }
                    }
                }
            }
        }
    }

    val loadedImages = (state as? GenerationsState.Loaded)?.images.orEmpty()
    val scope = rememberCoroutineScope()
    val pagerState = rememberPagerState { loadedImages.size }
    LaunchedEffect(selectedImage, loadedImages) {
        selectedImage?.let { uri ->
            val index = loadedImages.indexOf(uri)
            if (index >= 0 && pagerState.currentPage != index) pagerState.scrollToPage(index)
        }
    }
    selectedImage?.let { imageUri ->
        Dialog(
            onDismissRequest = { selectedImage = null },
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
                        ZoomableGenerationImage(uri, Modifier.fillMaxSize())
                    }
                }
                Row(
                    modifier = Modifier.fillMaxWidth().align(Alignment.TopEnd)
                        .padding(horizontal = 8.dp, vertical = 28.dp),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(onClick = { selectedImage = null }) {
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
                            val remaining = loadedImages.filterNot { it == uri }
                            state = GenerationsState.Loaded(remaining)
                            if (remaining.isEmpty()) selectedImage = null
                            else {
                                val next = pagerState.currentPage.coerceAtMost(remaining.lastIndex)
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
private fun ZoomableGenerationImage(uri: Uri, modifier: Modifier = Modifier) {
    var scale by remember(uri) { mutableStateOf(1f) }
    var offsetX by remember(uri) { mutableStateOf(0f) }
    var offsetY by remember(uri) { mutableStateOf(0f) }
    val scope = rememberCoroutineScope()
    var zoomAnimation by remember(uri) { mutableStateOf<Job?>(null) }
    val latestScale by rememberUpdatedState(scale)
    BoxWithConstraints(modifier = modifier) {
        val density = androidx.compose.ui.platform.LocalDensity.current
        val widthPx = with(density) { maxWidth.toPx() }
        val heightPx = with(density) { maxHeight.toPx() }
        AsyncImage(
            model = uri,
            contentDescription = "Generated image preview",
            contentScale = ContentScale.Fit,
            modifier = Modifier.fillMaxSize()
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    translationX = offsetX
                    translationY = offsetY
                }
                .pointerInput(uri) {
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
                .pointerInput(uri, widthPx, heightPx) {
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
private fun GenerationsMosaic(images: List<Uri>, blockIndex: Int, onImageClick: (Uri) -> Unit) {
    val gap = 2.dp
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val cellSize = (maxWidth - gap * 2) / 3
        val featureSize = cellSize * 2 + gap

        if (images.size < 3) {
            Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                images.forEach { image ->
                    GenerationTile(image, Modifier.size(cellSize), onImageClick)
                }
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(gap)) {
                Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                    if (blockIndex % 2 == 0) {
                        GenerationTile(images[0], Modifier.size(featureSize), onImageClick)
                        Column(verticalArrangement = Arrangement.spacedBy(gap)) {
                            GenerationTile(images[1], Modifier.size(cellSize), onImageClick)
                            GenerationTile(images[2], Modifier.size(cellSize), onImageClick)
                        }
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(gap)) {
                            GenerationTile(images[1], Modifier.size(cellSize), onImageClick)
                            GenerationTile(images[2], Modifier.size(cellSize), onImageClick)
                        }
                        GenerationTile(images[0], Modifier.size(featureSize), onImageClick)
                    }
                }
                if (images.size > 3) {
                    Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                        (3 until images.size).forEach { index ->
                            GenerationTile(images[index], Modifier.size(cellSize), onImageClick)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun GenerationTile(image: Uri, modifier: Modifier, onImageClick: (Uri) -> Unit) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(2.dp))
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
