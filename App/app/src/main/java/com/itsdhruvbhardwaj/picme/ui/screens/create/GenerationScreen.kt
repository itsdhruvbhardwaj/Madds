package com.itsdhruvbhardwaj.picme.ui.screens.create

import android.app.Activity
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
import androidx.compose.ui.draw.shadow
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
import com.itsdhruvbhardwaj.picme.utils.AdManager

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GenerationScreen(
    state: GenerationUiState,
    statusMessage: String,
    selectedPhotos: List<Uri>,
    isInterstitialVisible: Boolean,
    onAdShow: () -> Unit,
    onAdDismiss: () -> Unit,
    onCancelClick: () -> Unit,
    onRetryClick: () -> Unit,
    onSuccess: (String) -> Unit
) {
    val context = LocalContext.current

    // Trigger interstitial ad once when the generation process starts
    // Only shows if the ad is already preloaded
    LaunchedEffect(Unit) {
        val activity = context as? Activity
        if (activity != null && AdManager.isInterstitialReady()) {
            onAdShow()
            AdManager.showInterstitial(activity) {
                onAdDismiss()
            }
        }
    }

    // Wait for BOTH generation success and ad dismissal before navigating
    LaunchedEffect(state, isInterstitialVisible) {
        if (state is GenerationUiState.Success && !isInterstitialVisible) {
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
                    .shadow(
                        elevation = 20.dp,
                        shape = RoundedCornerShape(32.dp),
                        ambientColor = Primary.copy(alpha = 0.2f),
                        spotColor = Primary.copy(alpha = 0.3f)
                    )
                    .clip(RoundedCornerShape(32.dp))
                    .background(Color(0xFFF3F4F6)),
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
                    PremiumPulsingIcon()
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
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onBackground
                    ),
                    textAlign = TextAlign.Center
                )
            }

            Spacer(modifier = Modifier.height(24.dp))
            
            LinearProgressIndicator(
                modifier = Modifier
                    .fillMaxWidth(0.6f)
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
                        text = "Our AI is dreaming up your masterpiece. This usually takes 20-30 seconds.",
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
            // Prominent studio-style display for 1 photo Studio style display for 1 photo
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
    val infiniteTransition = rememberInfiniteTransition(label = "premiumProcessing")
    
    // Smooth Crystal Shimmer
    val shimmerTranslate by infiniteTransition.animateFloat(
        initialValue = -1000f,
        targetValue = 2000f,
        animationSpec = infiniteRepeatable(
            animation = tween(2500, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "shimmer"
    )

    // Neon Scanning Line
    val scanLineY by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(4000, easing = LinearOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "laserScan"
    )

    Box(modifier = Modifier.fillMaxSize()) {
        // Transparent crystal shimmer overlay
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.linearGradient(
                        colors = listOf(
                            Color.Transparent,
                            Primary.copy(alpha = 0.05f),
                            Secondary.copy(alpha = 0.15f),
                            Primary.copy(alpha = 0.05f),
                            Color.Transparent
                        ),
                        start = Offset(shimmerTranslate, shimmerTranslate),
                        end = Offset(shimmerTranslate + 600f, shimmerTranslate + 600f)
                    )
                )
        )

        // Animated Neon Laser Scan
        Canvas(modifier = Modifier.fillMaxSize()) {
            val y = size.height * scanLineY
            
            // Outer glow of the laser
            drawRect(
                brush = Brush.verticalGradient(
                    colors = listOf(
                        Color.Transparent,
                        Primary.copy(alpha = 0.1f),
                        Primary.copy(alpha = 0.1f),
                        Color.Transparent
                    )
                ),
                topLeft = Offset(0f, y - 40.dp.toPx()),
                size = androidx.compose.ui.geometry.Size(size.width, 80.dp.toPx())
            )

            // Sharp neon line
            drawLine(
                brush = Brush.horizontalGradient(
                    colors = listOf(
                        Color.Transparent,
                        Primary,
                        Secondary,
                        Primary,
                        Color.Transparent
                    )
                ),
                start = Offset(0f, y),
                end = Offset(size.width, y),
                strokeWidth = 2.5.dp.toPx()
            )
        }

        // Vignette effect to draw focus to center
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.radialGradient(
                        colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.1f)),
                        center = Offset.Unspecified,
                        radius = 1000f
                    )
                )
        )
    }
}

@Composable
fun PremiumPulsingIcon() {
    val infiniteTransition = rememberInfiniteTransition(label = "premiumGlow")
    
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1500, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scale"
    )

    val glowAlpha by infiniteTransition.animateFloat(
        initialValue = 0.2f,
        targetValue = 0.5f,
        animationSpec = infiniteRepeatable(
            animation = tween(1500, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glowAlpha"
    )
    
    Box(contentAlignment = Alignment.Center) {
        // Outer glow halo
        Box(
            modifier = Modifier
                .size(100.dp)
                .graphicsLayer(scaleX = pulseScale * 1.2f, scaleY = pulseScale * 1.2f)
                .background(
                    Brush.radialGradient(
                        colors = listOf(Primary.copy(alpha = glowAlpha), Color.Transparent)
                    )
                )
        )

        Surface(
            modifier = Modifier
                .size(80.dp)
                .graphicsLayer(scaleX = pulseScale, scaleY = pulseScale),
            shape = RoundedCornerShape(26.dp),
            color = Color.White,
            tonalElevation = 8.dp,
            shadowElevation = 16.dp
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Default.AutoAwesome,
                    contentDescription = null,
                    modifier = Modifier.size(40.dp),
                    tint = Primary
                )
            }
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
