package com.itsdhruvbhardwaj.picme.ui.screens.create

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.itsdhruvbhardwaj.picme.ui.components.PicMeButton
import com.itsdhruvbhardwaj.picme.ui.components.PicMeSecondaryButton
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResultScreen(
    imageBase64: String,
    isActionLoading: Boolean,
    viewModel: GenerationViewModel,
    onBackClick: () -> Unit,
    onSaveClick: () -> Unit,
    onShareClick: () -> Unit,
    onGenerateAgainClick: () -> Unit
) {
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    var showFullscreenPreview by remember { mutableStateOf(false) }
    var previewScale by remember { mutableFloatStateOf(1f) }
    var previewOffset by remember { mutableStateOf(Offset.Zero) }
    var previewSize by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }

    BackHandler(enabled = showFullscreenPreview) {
        showFullscreenPreview = false
    }

    LaunchedEffect(showFullscreenPreview) {
        if (!showFullscreenPreview) {
            previewScale = 1f
            previewOffset = Offset.Zero
        }
    }
    
    LaunchedEffect(Unit) {
        viewModel.eventFlow.collectLatest { event ->
            when (event) {
                is GenerationEvent.ShowSnackbar -> {
                    snackbarHostState.showSnackbar(event.message)
                }
            }
        }
    }
    
    // Clean the base64 string if it contains the data:image prefix
    val cleanBase64 = remember(imageBase64) {
        if (imageBase64.contains(",")) {
            imageBase64.substringAfter(",")
        } else {
            imageBase64
        }
    }
    
    val imageBytes = remember(cleanBase64) {
        try {
            Base64.decode(cleanBase64, Base64.DEFAULT)
        } catch (e: Exception) {
            null
        }
    }

    val sourceImageSize = remember(imageBytes) {
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        imageBytes?.let { bytes ->
            runCatching { BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) }
        }
        androidx.compose.ui.unit.IntSize(options.outWidth.coerceAtLeast(1), options.outHeight.coerceAtLeast(1))
    }
    val previewTransformState = rememberTransformableState { zoomChange, panChange, _ ->
        val newScale = (previewScale * zoomChange).coerceIn(1f, 5f)
        previewScale = newScale
        if (newScale <= 1f) {
            previewOffset = Offset.Zero
        } else {
            val fitScale = minOf(
                previewSize.width.toFloat() / sourceImageSize.width,
                previewSize.height.toFloat() / sourceImageSize.height
            )
            val maxX = ((sourceImageSize.width * fitScale * newScale) - previewSize.width).coerceAtLeast(0f) / 2f
            val maxY = ((sourceImageSize.height * fitScale * newScale) - previewSize.height).coerceAtLeast(0f) / 2f
            previewOffset = Offset(
                x = (previewOffset.x + panChange.x).coerceIn(-maxX, maxX),
                y = (previewOffset.y + panChange.y).coerceIn(-maxY, maxY)
            )
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Your Creation", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = onSaveClick, enabled = !isActionLoading && imageBytes != null) {
                        Icon(Icons.Default.Download, contentDescription = "Save")
                    }
                    IconButton(onClick = onShareClick, enabled = !isActionLoading && imageBytes != null) {
                        Icon(Icons.Default.Share, contentDescription = "Share")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
            )
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Main Generated Image
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .clip(MaterialTheme.shapes.extraLarge)
                    .clickable(enabled = imageBytes != null) { showFullscreenPreview = true },
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF3F4F6))
            ) {
                if (imageBytes != null) {
                    AsyncImage(
                        model = ImageRequest.Builder(context)
                            .data(imageBytes)
                            .crossfade(true)
                            .build(),
                        contentDescription = "Generated AI Photo",
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Failed to load image",
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(32.dp))
            
            Text(
                text = "Your masterpiece is ready!",
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground
            )

            Text(
                text = "Save it to your gallery or share it with friends",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp)
            )

            Text(
                text = "Tap the image to view it full screen",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 8.dp)
            )
            
            Spacer(modifier = Modifier.weight(1f))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                PicMeSecondaryButton(
                    text = "Save",
                    onClick = onSaveClick,
                    isLoading = isActionLoading,
                    modifier = Modifier.weight(1f),
                    enabled = imageBytes != null
                )
                PicMeButton(
                    text = "Share",
                    onClick = onShareClick,
                    isLoading = false, // Shared via intent, loading not needed here usually
                    modifier = Modifier.weight(1f),
                    enabled = imageBytes != null
                )
            }
            
            Spacer(modifier = Modifier.height(16.dp))
            
            PicMeSecondaryButton(
                text = "Generate Again",
                onClick = onGenerateAgainClick,
                enabled = !isActionLoading,
                modifier = Modifier.fillMaxWidth()
            )
            
            Spacer(modifier = Modifier.height(32.dp))
        }
    }

    if (showFullscreenPreview && imageBytes != null) {
        Dialog(
            onDismissRequest = { showFullscreenPreview = false },
            properties = DialogProperties(usePlatformDefaultWidth = false)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black),
                contentAlignment = Alignment.Center
            ) {
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(imageBytes)
                        .crossfade(true)
                        .build(),
                    contentDescription = "Full-screen preview of your generated photo",
                    modifier = Modifier
                        .fillMaxSize()
                        .onSizeChanged { previewSize = it }
                        .pointerInput(Unit) {
                            detectTapGestures(onDoubleTap = {
                                previewScale = if (previewScale <= 1f) 2.5f else 1f
                                previewOffset = Offset.Zero
                            })
                        }
                        .graphicsLayer {
                            scaleX = previewScale
                            scaleY = previewScale
                            translationX = previewOffset.x
                            translationY = previewOffset.y
                        }
                        .transformable(
                            state = previewTransformState,
                            lockRotationOnZoomPan = true
                        ),
                    contentScale = ContentScale.Fit
                )
                IconButton(
                    onClick = { showFullscreenPreview = false },
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .statusBarsPadding()
                        .padding(8.dp)
                        .background(Color.Black.copy(alpha = 0.55f), MaterialTheme.shapes.extraLarge)
                ) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = "Close full-screen preview",
                        tint = Color.White
                    )
                }

                Text(
                    text = "Pinch or double-tap to zoom · drag to move",
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White.copy(alpha = 0.8f),
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .statusBarsPadding()
                        .padding(top = 12.dp)
                        .background(Color.Black.copy(alpha = 0.5f), MaterialTheme.shapes.small)
                        .padding(horizontal = 12.dp, vertical = 7.dp)
                )

                Button(
                    onClick = onSaveClick,
                    enabled = !isActionLoading,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding()
                        .padding(bottom = 20.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFD1AD68),
                        contentColor = Color(0xFF201A0E)
                    )
                ) {
                    Icon(Icons.Default.Download, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (isActionLoading) "Saving…" else "Download")
                }
            }
        }
    }
}
