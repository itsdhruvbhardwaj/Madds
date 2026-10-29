package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.compose.material3.MaterialTheme

import android.app.Activity
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.InsufficientCreditsBottomSheet
import com.itsdhruvbhardwaj.picme.ui.components.PicMeButton
import com.itsdhruvbhardwaj.picme.ui.components.PicMeCompactHeader
import com.itsdhruvbhardwaj.picme.ui.theme.Primary
import com.itsdhruvbhardwaj.picme.ui.theme.TextSecondary
import com.itsdhruvbhardwaj.picme.utils.AdManager

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StyleDetailsScreen(
    authViewModel: AuthViewModel,
    viewModel: StyleDetailsViewModel,
    onBackClick: () -> Unit,
    onTryStyleClick: (String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val authState by authViewModel.authState.collectAsState()
    val user = (authState as? AuthState.Authenticated)?.user
    val isAuthenticated = authState is AuthState.Authenticated
    val context = LocalContext.current

    var showInsufficientCreditsSheet by remember { mutableStateOf(false) }
    val currentStyle = (uiState as? StyleDetailsUiState.Success)?.style

    LaunchedEffect(Unit) {
        viewModel.toastEvent.collect { message ->
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        // Blurred Wallpaper Background


        Scaffold(
            containerColor = Color.Transparent,
            bottomBar = {
                currentStyle?.let { style ->
                    GenerateActionBar(
                        creditsRequired = style.tokensRequired,
                        onGenerate = {
                            val currentCredits = user?.credits ?: 0
                            if (currentCredits >= style.tokensRequired) {
                                val activity = context as? Activity
                                if (activity != null) {
                                    AdManager.showInterstitial(activity) { onTryStyleClick(style.id) }
                                } else {
                                    onTryStyleClick(style.id)
                                }
                            } else {
                                showInsufficientCreditsSheet = true
                            }
                        }
                    )
                }
            }
        ) { innerPadding ->
            Box(modifier = Modifier.fillMaxSize()) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(bottom = innerPadding.calculateBottomPadding())
                        .padding(horizontal = 24.dp)
                ) {
                    // Initial top spacing to start content below the floating pill
                    Spacer(modifier = Modifier.windowInsetsTopHeight(WindowInsets.statusBars))
                    Spacer(modifier = Modifier.height(76.dp)) // 12 (top padding) + 56 (pill height) + 8 (bottom padding)

                    when (val state = uiState) {
                        is StyleDetailsUiState.Loading -> {
                            Box(modifier = Modifier.fillMaxWidth().height(400.dp), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(color = Primary)
                            }
                        }
                        is StyleDetailsUiState.Error -> {
                            Box(modifier = Modifier.fillMaxWidth().height(400.dp), contentAlignment = Alignment.Center) {
                                Text(text = state.message, color = MaterialTheme.colorScheme.error)
                            }
                        }
                        is StyleDetailsUiState.Success -> {
                            val style = state.style
                            val beforeUrl = style.exampleBeforeUrl ?: style.previewImages?.getOrNull(0)
                            val afterUrl = style.exampleAfterUrl ?: style.previewImages?.getOrNull(1)
                            val comparisonReveal = remember(style.id) { Animatable(0.5f) }
                            var comparisonPaused by remember(style.id) { mutableStateOf(false) }

                            Spacer(modifier = Modifier.height(8.dp))

                            if (!beforeUrl.isNullOrBlank() && !afterUrl.isNullOrBlank()) {
                                BeforeAfterComparison(
                                    beforeUrl = beforeUrl,
                                    afterUrl = afterUrl,
                                    styleName = style.name,
                                    reveal = comparisonReveal,
                                    animationPaused = comparisonPaused,
                                    onInteraction = { comparisonPaused = true },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .aspectRatio(5f / 7f)
                                )
                            } else {
                                AsyncImage(
                                    model = ImageRequest.Builder(LocalContext.current)
                                        .data(style.thumbnail)
                                        .crossfade(true)
                                        .build(),
                                    contentDescription = style.name,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .aspectRatio(5f / 7f)
                                        .shadow(12.dp, RoundedCornerShape(20.dp))
                                        .clip(RoundedCornerShape(20.dp))
                                        .background(MaterialTheme.colorScheme.surfaceVariant)
                                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(20.dp)),
                                    contentScale = ContentScale.Crop
                                )
                            }

                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = style.description,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                lineHeight = 21.sp
                            )

                            Spacer(modifier = Modifier.height(20.dp))
                        }
                    }
                }

                // Floating Overlay Header
                val title = if (uiState is StyleDetailsUiState.Success) {
                    (uiState as StyleDetailsUiState.Success).style.name
                } else {
                    ""
                }

                PicMeCompactHeader(
                    title = title,
                    onBackClick = onBackClick,
                    actions = {
                        if (uiState is StyleDetailsUiState.Success) {
                            val style = (uiState as StyleDetailsUiState.Success).style
                            IconButton(onClick = {
                                if (isAuthenticated) {
                                    viewModel.toggleFavorite()
                                }
                            }) {
                                Icon(
                                    imageVector = if (style.isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                                    contentDescription = "Favorite",
                                    tint = if (style.isFavorite) Color.Red else MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                    }
                )
            }
        }
    }

    if (showInsufficientCreditsSheet && uiState is StyleDetailsUiState.Success) {
        val style = (uiState as StyleDetailsUiState.Success).style
        InsufficientCreditsBottomSheet(
            viewModel = authViewModel,
            requiredCredits = style.tokensRequired,
            availableCredits = user?.credits ?: 0,
            onDismiss = { showInsufficientCreditsSheet = false }
        )
    }
}

@Composable
private fun BeforeAfterComparison(
    beforeUrl: String,
    afterUrl: String,
    styleName: String,
    reveal: Animatable<Float, AnimationVector1D>,
    animationPaused: Boolean,
    onInteraction: () -> Unit,
    modifier: Modifier = Modifier
) {
    val dragScope = rememberCoroutineScope()

    LaunchedEffect(beforeUrl, afterUrl, animationPaused) {
        if (!animationPaused) {
            while (isActive) {
                reveal.animateTo(
                    0f,
                    animationSpec = tween(durationMillis = 2200, easing = FastOutSlowInEasing)
                )
                delay(350)
                reveal.animateTo(
                    1f,
                    animationSpec = tween(durationMillis = 2200, easing = FastOutSlowInEasing)
                )
                delay(350)
            }
        }
    }

    BoxWithConstraints(
        modifier = modifier
            .shadow(12.dp, RoundedCornerShape(20.dp))
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(20.dp))
            .pointerInput(beforeUrl, afterUrl) {
                detectDragGestures(
                    onDragStart = { onInteraction() },
                    onDrag = { change, dragAmount ->
                        change.consume()
                        val nextReveal = (reveal.value + dragAmount.x / size.width).coerceIn(0f, 1f)
                        dragScope.launch { reveal.snapTo(nextReveal) }
                    }
                )
            }
    ) {
        AsyncImage(
            model = ImageRequest.Builder(LocalContext.current)
                .data(afterUrl)
                .crossfade(true)
                .build(),
            contentDescription = "After example for $styleName",
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )

        val handleRadius = 18.dp
        val splitX = handleRadius + (maxWidth - handleRadius * 2) * reveal.value

        Box(
            modifier = Modifier
                .fillMaxSize()
                .drawWithContent {
                    val splitFraction = splitX / maxWidth
                    clipRect(right = size.width * splitFraction) {
                        this@drawWithContent.drawContent()
                    }
                }
        ) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(beforeUrl)
                    .crossfade(true)
                    .build(),
                contentDescription = "Before example for $styleName",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
        }

        Box(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .offset(x = splitX - 1.dp)
                .fillMaxHeight()
                .width(2.dp)
                .background(Color.White.copy(alpha = 0.9f))
        )

        Surface(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .offset(x = splitX - handleRadius)
                .size(36.dp),
            shape = CircleShape,
            color = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            border = BorderStroke(2.dp, Color.White.copy(alpha = 0.9f)),
            shadowElevation = 4.dp
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    text = "↔",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    textAlign = TextAlign.Center
                )
            }
        }

        Surface(
            modifier = Modifier.align(Alignment.TopStart).padding(12.dp),
            shape = CircleShape,
            color = Color.Black.copy(alpha = 0.58f),
            contentColor = Color.White
        ) {
            Text(
                text = "Before",
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold)
            )
        }
        Surface(
            modifier = Modifier.align(Alignment.TopEnd).padding(12.dp),
            shape = CircleShape,
            color = Color.Black.copy(alpha = 0.58f),
            contentColor = Color.White
        ) {
            Text(
                text = "After",
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold)
            )
        }
    }
}

@Composable
private fun GenerateActionBar(
    creditsRequired: Int,
    onGenerate: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 20.dp, vertical = 10.dp)
            .shadow(10.dp, RoundedCornerShape(24.dp))
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(24.dp))
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(24.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "$creditsRequired credits",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface
            )
            Text(
                text = "per generation",
                style = MaterialTheme.typography.labelSmall,
                color = TextSecondary
            )
        }
        PicMeButton(
            text = "Generate",
            onClick = onGenerate,
            modifier = Modifier.width(144.dp).height(48.dp),
            shadowElevation = 0.dp
        )
    }
}
