package com.itsdhruvbhardwaj.picme.ui.screens.create

import androidx.compose.material3.MaterialTheme

import android.net.Uri
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
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
import com.itsdhruvbhardwaj.picme.R
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
    val context = LocalContext.current

    LaunchedEffect(state) {
        if (state is GenerationUiState.Success) {
            onSuccess(state.imageBase64)
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        // Softly Blurred Glassmorphism Background


        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
        )

        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = {},
                    navigationIcon = {
                        IconButton(onClick = onCancelClick) {
                            Icon(Icons.Default.Close, contentDescription = "Cancel", tint = MaterialTheme.colorScheme.onSurface)
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
                )
            }
        ) { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = innerPadding.calculateTopPadding())
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "Creating Your AI Photo",
                    style = MaterialTheme.typography.headlineMedium.copy(
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 28.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    ),
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(32.dp))

                // Main Preview Area - Visual Focus
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(0.85f)
                        .shadow(
                            elevation = 20.dp,
                            shape = RoundedCornerShape(32.dp),
                            ambientColor = Primary.copy(alpha = 0.2f),
                            spotColor = Primary.copy(alpha = 0.3f)
                        )
                        .clip(RoundedCornerShape(32.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(32.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    if (state is GenerationUiState.Error) {
                        GenerationErrorView(state.message, onRetryClick)
                    } else {
                        // 1. Display selected photos
                        PhotoComposition(selectedPhotos = selectedPhotos)

                        // 2. Premium Processing layer (Shimmer + Laser Scan)
                        PremiumProcessingOverlay()

                        // 3. Central pulsing AI centerpiece
                        GenerationDots()
                    }
                }

                Spacer(modifier = Modifier.height(48.dp))

                // Smoothly transitioning status messages
                AnimatedContent(
                    targetState = statusMessage,
                    transitionSpec = {
                        fadeIn(animationSpec = tween(600)) + slideInVertically { it / 2 } togetherWith
                        fadeOut(animationSpec = tween(600)) + slideOutVertically { -it / 2 }
                    },
                    label = "statusMessage"
                ) { targetMessage ->
                    Text(
                        text = targetMessage,
                        style = MaterialTheme.typography.bodyLarge.copy(
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 18.sp
                        ),
                        textAlign = TextAlign.Center
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                LinearProgressIndicator(
                    modifier = Modifier
                        .fillMaxWidth(0.6f)
                        .height(8.dp)
                        .clip(RoundedCornerShape(4.dp)),
                    color = Primary,
                    trackColor = Primary.copy(alpha = 0.1f)
                )

                Spacer(modifier = Modifier.height(48.dp))

                // Tip Card - Premium Glass Styling
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 32.dp)
                        .shadow(8.dp, RoundedCornerShape(24.dp)),
                    shape = RoundedCornerShape(24.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Row(
                        modifier = Modifier.padding(20.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            modifier = Modifier.size(10.dp),
                            shape = RoundedCornerShape(5.dp),
                            color = Secondary
                        ) {}
                        Spacer(modifier = Modifier.width(16.dp))
                        Text(
                            text = "Our AI is creating your image. This can take up to a couple of minutes.",
                            style = MaterialTheme.typography.bodyMedium.copy(
                                fontWeight = FontWeight.Medium,
                                color = Color(0xFF4B5563)
                            )
                        )
                    }
                }

                // Bottom spacing for global banner ad
                Spacer(modifier = Modifier.height(100.dp))
            }
        }
    }
}

@Composable
fun PhotoComposition(selectedPhotos: List<Uri>) {
    val context = LocalContext.current
    Box(modifier = Modifier.fillMaxSize()) {
        if (selectedPhotos.size >= 2) {
            // Premium Stacked composition for 2 photos
            Box(modifier = Modifier.fillMaxSize()) {
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(selectedPhotos[0])
                        .crossfade(true)
                        .build(),
                    contentDescription = null,
                    modifier = Modifier
                        .fillMaxWidth(0.78f)
                        .fillMaxHeight(0.78f)
                        .align(Alignment.TopStart)
                        .padding(12.dp)
                        .rotate(-6f)
                        .shadow(12.dp, RoundedCornerShape(24.dp))
                        .clip(RoundedCornerShape(24.dp))
                        .border(6.dp, Color.White, RoundedCornerShape(24.dp)),
                    contentScale = ContentScale.Crop
                )
                AsyncImage(
                    model = ImageRequest.Builder(context)
                        .data(selectedPhotos[1])
                        .crossfade(true)
                        .build(),
                    contentDescription = null,
                    modifier = Modifier
                        .fillMaxWidth(0.78f)
                        .fillMaxHeight(0.78f)
                        .align(Alignment.BottomEnd)
                        .padding(12.dp)
                        .rotate(6f)
                        .shadow(12.dp, RoundedCornerShape(24.dp))
                        .clip(RoundedCornerShape(24.dp))
                        .border(6.dp, Color.White, RoundedCornerShape(24.dp)),
                    contentScale = ContentScale.Crop
                )
            }
        } else if (selectedPhotos.isNotEmpty()) {
            AsyncImage(
                model = ImageRequest.Builder(context)
                    .data(selectedPhotos[0])
                    .crossfade(true)
                    .build(),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(8.dp)
                    .clip(RoundedCornerShape(24.dp)),
                contentScale = ContentScale.Crop
            )
        }
    }
}

@Composable
fun PremiumProcessingOverlay() {
    // Keep the selected photo readable while making the centered loading dots visible.
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.12f))
    )
}

@Composable
fun GenerationDots() {
    val transition = rememberInfiniteTransition(label = "generationDots")
    val progress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "dotSequence"
    )
    val gold = Color(0xFFE2C16F)

    Row(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(3) { index ->
            // Move the pulse left-to-right, one gold dot at a time.
            val phase = (progress * 3f - index + 3f) % 3f
            val pulse = if (phase < 1f) 1f - kotlin.math.abs(phase - 0.5f) * 2f else 0f
            val easedPulse = FastOutSlowInEasing.transform(pulse.coerceIn(0f, 1f))

            Box(
                modifier = Modifier
                    .size(11.dp)
                    .graphicsLayer {
                        val scale = 0.68f + easedPulse * 0.32f
                        scaleX = scale
                        scaleY = scale
                        alpha = 0.35f + easedPulse * 0.65f
                        translationY = -5.dp.toPx() * easedPulse
                    }
                    .background(gold, CircleShape)
            )
        }
    }
}

@Composable
fun GenerationErrorView(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.padding(32.dp).fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Surface(
            modifier = Modifier.size(64.dp),
            shape = RoundedCornerShape(20.dp),
            color = MaterialTheme.colorScheme.errorContainer
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Default.Close,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(32.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        Text(
            text = "Something went wrong",
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
        Spacer(modifier = Modifier.height(32.dp))
        Button(
            onClick = onRetry,
            modifier = Modifier.fillMaxWidth().height(56.dp),
            shape = RoundedCornerShape(28.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Primary)
        ) {
            Text("Try Again", fontWeight = FontWeight.Bold)
        }
    }
}
