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
import com.itsdhruvbhardwaj.picme.ui.components.LocalCreditsLauncher
import com.itsdhruvbhardwaj.picme.ui.components.CreditsRequest
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
    onSuccess: (String) -> Unit,
    onMyGenerationsClick: () -> Unit = onCancelClick
) {
    val openCredits = LocalCreditsLauncher.current

    LaunchedEffect(state) {
        if (state is GenerationUiState.Success) {
            onSuccess(state.imageBase64)
        } else if (state is GenerationUiState.Error && state.requiredCredits != null) {
            openCredits(CreditsRequest(state.requiredCredits, state.availableCredits))
        }
    }

    val errorAction: () -> Unit = {
        if (state is GenerationUiState.Error) {
            when {
                state.requiredCredits != null -> openCredits(CreditsRequest(state.requiredCredits, state.availableCredits))
                state.isExpired -> onMyGenerationsClick()
                state.isAmbiguous -> onRetryClick()
                else -> onCancelClick()
            }
        }
    }
    val errorActionLabel = when {
        state !is GenerationUiState.Error -> "Back"
        state.requiredCredits != null -> "Get credits"
        state.isExpired -> "My Generations"
        state.isAmbiguous -> "Check status"
        else -> "Back"
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Text(if (state is GenerationUiState.Error) "Your Photo" else "Creating Your AI Photo",
                        style = MaterialTheme.typography.titleLarge.copy(fontSize = 20.sp, fontWeight = FontWeight.Bold),
                        maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                },
                navigationIcon = {
                    IconButton(onClick = onCancelClick) {
                        Icon(Icons.Default.Close, contentDescription = "Continue browsing")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
            )
        }
    ) { innerPadding ->
        BoxWithConstraints(Modifier.fillMaxSize().padding(innerPadding)) {
            // Fit the portrait preview into the space left by the actual footer.
            // Short landscape windows and large accessibility fonts can still scroll.
            val scroll = maxHeight < 360.dp || androidx.compose.ui.platform.LocalDensity.current.fontScale > 1.5f
            Column(
                Modifier.fillMaxSize()
                    .then(if (scroll) Modifier.verticalScroll(rememberScrollState()) else Modifier)
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (scroll) {
                    GenerationPreview(state, selectedPhotos, errorAction, errorActionLabel,
                        Modifier.widthIn(max = 360.dp).fillMaxWidth().aspectRatio(5f / 7f))
                } else {
                    BoxWithConstraints(Modifier.fillMaxWidth().weight(1f, fill = false), contentAlignment = Alignment.TopCenter) {
                        val previewWidth = minOf(maxWidth, maxHeight * (5f / 7f), 520.dp)
                        GenerationPreview(state, selectedPhotos, errorAction, errorActionLabel,
                            Modifier.width(previewWidth).aspectRatio(5f / 7f))
                    }
                }

                AnimatedContent(
                    targetState = statusMessage,
                    transitionSpec = { fadeIn(tween(300)) togetherWith fadeOut(tween(200)) },
                    label = "statusMessage"
                ) { message ->
                    Text(message, style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
                }

                if (state !is GenerationUiState.Error) LinearProgressIndicator(
                    Modifier.fillMaxWidth(0.6f).height(4.dp).clip(RoundedCornerShape(4.dp)),
                    color = Primary, trackColor = Primary.copy(alpha = 0.1f)
                )

                Surface(
                    Modifier.widthIn(max = 520.dp).fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
                ) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(6.dp).background(Secondary, CircleShape))
                        Spacer(Modifier.width(10.dp))
                        Text(
                            if (state is GenerationUiState.Error) "Checking a previous generation does not start a new one."
                            else "Your photo will be available in My Generations for 24 hours. You can keep browsing.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun GenerationPreview(
    state: GenerationUiState, selectedPhotos: List<Uri>, errorAction: () -> Unit,
    errorActionLabel: String, modifier: Modifier
) {
    val shape = RoundedCornerShape(24.dp)
    Box(modifier.shadow(8.dp, shape).clip(shape)
        .background(MaterialTheme.colorScheme.surface)
        .border(1.dp, MaterialTheme.colorScheme.outline, shape), contentAlignment = Alignment.Center) {
        if (state is GenerationUiState.Error) {
            GenerationErrorView(state.message, errorAction, errorActionLabel)
        } else {
            PhotoComposition(selectedPhotos)
            PremiumProcessingOverlay()
            GenerationDots()
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
fun GenerationErrorView(message: String, onRetry: () -> Unit, actionLabel: String = "Check status") {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
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
            Text(actionLabel, fontWeight = FontWeight.Bold)
        }
    }
}
