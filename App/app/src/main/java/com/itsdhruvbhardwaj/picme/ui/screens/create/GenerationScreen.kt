package com.itsdhruvbhardwaj.picme.ui.screens.create

import android.net.Uri
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.itsdhruvbhardwaj.picme.ui.theme.Primary
import com.itsdhruvbhardwaj.picme.ui.theme.Secondary
import com.itsdhruvbhardwaj.picme.ui.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GenerationScreen(
    state: GenerationUiState,
    statusMessage: String,
    selectedPhotos: List<Uri>,
    onCancelClick: () -> Unit,
    onRetryClick: () -> Unit,
    onSuccess: (String) -> Unit
) {
    // Navigate to result on success
    LaunchedEffect(state) {
        if (state is GenerationUiState.Success) {
            onSuccess(state.imageBase64)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = onCancelClick) {
                        Icon(Icons.Default.Close, contentDescription = "Cancel")
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
            Text(
                text = "Creating Your AI Photo",
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 26.sp
                )
            )
            
            Spacer(modifier = Modifier.height(32.dp))

            // Main Preview Area - Visual Focus
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(0.85f)
                    .clip(RoundedCornerShape(32.dp))
                    .background(Color(0xFFF3F4F6)),
                contentAlignment = Alignment.Center
            ) {
                if (state is GenerationUiState.Error) {
                    GenerationErrorView(state.message, onRetryClick)
                } else {
                    // 1. Display selected photos
                    PhotoComposition(selectedPhotos = selectedPhotos)
                    
                    // 2. Processing animations layer
                    ProcessingOverlay()
                    
                    // 3. Central pulsing AI icon
                    PulsingAIIcon()
                }
            }

            Spacer(modifier = Modifier.height(48.dp))

            // Smoothly transitioning status messages
            AnimatedContent(
                targetState = statusMessage,
                transitionSpec = {
                    fadeIn(animationSpec = tween(500)) + slideInVertically { it / 2 } togetherWith
                    fadeOut(animationSpec = tween(500)) + slideOutVertically { -it / 2 }
                },
                label = "statusMessage"
            ) { targetMessage ->
                Text(
                    text = targetMessage,
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onBackground
                    ),
                    textAlign = TextAlign.Center
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            
            // Indeterminate progress indicator
            LinearProgressIndicator(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp)),
                color = Primary,
                trackColor = Primary.copy(alpha = 0.1f)
            )

            Spacer(modifier = Modifier.weight(1f))

            // Tip Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 24.dp),
                shape = MaterialTheme.shapes.large,
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF9FAFB))
            ) {
                Row(
                    modifier = Modifier.padding(20.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        modifier = Modifier.size(8.dp),
                        shape = RoundedCornerShape(4.dp),
                        color = Secondary
                    ) {}
                    Spacer(modifier = Modifier.width(16.dp))
                    Text(
                        text = "Our AI takes about 20-30 seconds to dream up your masterpiece.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary
                    )
                }
            }
        }
    }
}

@Composable
fun PhotoComposition(selectedPhotos: List<Uri>) {
    val context = LocalContext.current
    Box(modifier = Modifier.fillMaxSize()) {
        if (selectedPhotos.size >= 2) {
            // Stacked composition for 2 photos
            Box(modifier = Modifier.fillMaxSize()) {
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(selectedPhotos[0])
                        .crossfade(true)
                        .build(),
                    contentDescription = null,
                    modifier = Modifier
                        .fillMaxWidth(0.75f)
                        .fillMaxHeight(0.75f)
                        .align(Alignment.TopStart)
                        .padding(16.dp)
                        .rotate(-5f)
                        .clip(RoundedCornerShape(24.dp))
                        .border(4.dp, Color.White, RoundedCornerShape(24.dp)),
                    contentScale = ContentScale.Crop
                )
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(selectedPhotos[1])
                        .crossfade(true)
                        .build(),
                    contentDescription = null,
                    modifier = Modifier
                        .fillMaxWidth(0.75f)
                        .fillMaxHeight(0.75f)
                        .align(Alignment.BottomEnd)
                        .padding(16.dp)
                        .rotate(5f)
                        .clip(RoundedCornerShape(24.dp))
                        .border(4.dp, Color.White, RoundedCornerShape(24.dp)),
                    contentScale = ContentScale.Crop
                )
            }
        } else if (selectedPhotos.isNotEmpty()) {
            // Prominent display for 1 photo
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(selectedPhotos[0])
                    .crossfade(true)
                    .build(),
                contentDescription = null,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        }
    }
}

@Composable
fun ProcessingOverlay() {
    val infiniteTransition = rememberInfiniteTransition(label = "processing")
    
    // Shimmering transparent gradient
    val shimmerTranslate by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 2000f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmer"
    )

    // Scanning line animation
    val scanLineY by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(3000, easing = LinearOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scanLine"
    )

    Box(modifier = Modifier.fillMaxSize()) {
        // Transparent gradient shimmer overlay
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            Primary.copy(alpha = 0.1f),
                            Secondary.copy(alpha = 0.2f),
                            Primary.copy(alpha = 0.1f)
                        ),
                        start = Offset(shimmerTranslate - 1000f, shimmerTranslate - 1000f),
                        end = Offset(shimmerTranslate, shimmerTranslate)
                    )
                )
        )

        // Animated Scanning Line
        Canvas(modifier = Modifier.fillMaxSize()) {
            val y = size.height * scanLineY
            drawLine(
                brush = Brush.horizontalGradient(
                    colors = listOf(
                        Color.Transparent,
                        Primary.copy(alpha = 0.6f),
                        Secondary.copy(alpha = 0.6f),
                        Color.Transparent
                    )
                ),
                start = Offset(0f, y),
                end = Offset(size.width, y),
                strokeWidth = 3.dp.toPx()
            )
        }
    }
}

@Composable
fun PulsingAIIcon() {
    val infiniteTransition = rememberInfiniteTransition(label = "glow")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 0.9f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scale"
    )
    
    Surface(
        modifier = Modifier
            .size(72.dp)
            .graphicsLayer(scaleX = pulseScale, scaleY = pulseScale),
        shape = RoundedCornerShape(22.dp),
        color = Color.White.copy(alpha = 0.85f),
        tonalElevation = 6.dp,
        shadowElevation = 12.dp
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = Icons.Default.AutoAwesome,
                contentDescription = null,
                modifier = Modifier.size(36.dp),
                tint = Primary
            )
        }
    }
}

@Composable
fun GenerationErrorView(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Generation Error",
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            color = TextSecondary
        )
        Spacer(modifier = Modifier.height(24.dp))
        Button(
            onClick = onRetry,
            colors = ButtonDefaults.buttonColors(containerColor = Primary)
        ) {
            Text("Try Again")
        }
    }
}
