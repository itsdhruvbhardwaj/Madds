package com.itsdhruvbhardwaj.picme.ui.screens.home

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.InsufficientCreditsBottomSheet
import com.itsdhruvbhardwaj.picme.ui.components.PicMeButton
import com.itsdhruvbhardwaj.picme.ui.components.PicMeCompactHeader
import com.itsdhruvbhardwaj.picme.ui.components.TipsCard
import com.itsdhruvbhardwaj.picme.ui.theme.Primary
import com.itsdhruvbhardwaj.picme.ui.theme.TextSecondary

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

    LaunchedEffect(Unit) {
        viewModel.toastEvent.collect { message ->
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Blurred Wallpaper Background
        Image(
            painter = painterResource(id = R.drawable.glassmorphismwallpaper),
            contentDescription = null,
            modifier = Modifier
                .fillMaxSize()
                .blur(20.dp),
            contentScale = ContentScale.Crop
        )

        Scaffold(
            containerColor = Color.Transparent
        ) { _ -> // Ignore innerPadding to allow true overlay behavior
            Box(modifier = Modifier.fillMaxSize()) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
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
                            
                            Spacer(modifier = Modifier.height(16.dp))

                            // 1. Hero Image
                            AsyncImage(
                                model = ImageRequest.Builder(LocalContext.current)
                                    .data(style.thumbnail)
                                    .crossfade(true)
                                    .build(),
                                contentDescription = style.name,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .aspectRatio(1.0f)
                                    .shadow(12.dp, RoundedCornerShape(32.dp))
                                    .clip(RoundedCornerShape(32.dp))
                                    .background(Color.White.copy(alpha = 0.2f))
                                    .border(1.dp, Color.White.copy(alpha = 0.4f), RoundedCornerShape(32.dp)),
                                contentScale = ContentScale.Crop
                            )
                            
                            Spacer(modifier = Modifier.height(32.dp))
                            
                            Column(
                                verticalArrangement = Arrangement.spacedBy(24.dp)
                            ) {
                                // Title & Category Row
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = style.name,
                                        style = MaterialTheme.typography.headlineSmall.copy(
                                            fontWeight = FontWeight.ExtraBold,
                                            fontSize = 28.sp,
                                            color = Color(0xFF1E293B)
                                        ),
                                        modifier = Modifier.weight(1f)
                                    )
                                    
                                    Surface(
                                        color = Color.White.copy(alpha = 0.5f),
                                        shape = RoundedCornerShape(12.dp),
                                        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.6f))
                                    ) {
                                        Text(
                                            text = style.category,
                                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                                            style = MaterialTheme.typography.labelMedium.copy(
                                                fontWeight = FontWeight.Bold,
                                                color = Primary
                                            )
                                        )
                                    }
                                }
                                
                                // Description
                                Text(
                                    text = style.description,
                                    style = MaterialTheme.typography.bodyLarge,
                                    color = Color(0xFF374151),
                                    lineHeight = 26.sp
                                )
                                
                                // Glass Tips Card
                                TipsCard(
                                    tips = listOf(
                                        "Use clear, front-facing photos",
                                        "Good lighting works best"
                                    ),
                                    modifier = Modifier.fillMaxWidth()
                                )

                                // 2. Dynamic Preview Section
                                if (!style.previewImages.isNullOrEmpty()) {
                                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                                        Text(
                                            text = "Sample Results",
                                            style = MaterialTheme.typography.titleMedium.copy(
                                                fontWeight = FontWeight.ExtraBold,
                                                color = Color(0xFF1E293B)
                                            )
                                        )
                                        LazyRow(
                                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                                            modifier = Modifier.fillMaxWidth()
                                        ) {
                                            items(style.previewImages!!) { imageUrl ->
                                                AsyncImage(
                                                    model = ImageRequest.Builder(LocalContext.current)
                                                        .data(imageUrl)
                                                        .crossfade(true)
                                                        .build(),
                                                    contentDescription = null,
                                                    modifier = Modifier
                                                        .width(140.dp)
                                                        .height(190.dp)
                                                        .shadow(4.dp, RoundedCornerShape(20.dp))
                                                        .clip(RoundedCornerShape(20.dp))
                                                        .background(Color.White.copy(alpha = 0.3f))
                                                        .border(1.dp, Color.White.copy(alpha = 0.5f), RoundedCornerShape(20.dp)),
                                                    contentScale = ContentScale.Crop
                                                )
                                            }
                                        }
                                    }
                                }

                                // Generate Button Section
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 16.dp)
                                        .background(Color.White.copy(alpha = 0.6f), RoundedCornerShape(24.dp))
                                        .border(BorderStroke(1.dp, Color.White.copy(alpha = 0.7f)), RoundedCornerShape(24.dp))
                                ) {
                                    Row(
                                        modifier = Modifier.padding(20.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(
                                            modifier = Modifier.weight(1f),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Icon(
                                                imageVector = Icons.Default.Star,
                                                contentDescription = null,
                                                tint = Color(0xFFF59E0B),
                                                modifier = Modifier.size(24.dp)
                                            )
                                            Spacer(modifier = Modifier.width(10.dp))
                                            Column {
                                                Text(
                                                    text = "${style.tokensRequired} Credits",
                                                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                                                    color = Color.Black
                                                )
                                                Text(
                                                    text = "per generation",
                                                    style = MaterialTheme.typography.labelSmall,
                                                    color = TextSecondary
                                                )
                                            }
                                        }
                                        
                                        PicMeButton(
                                            text = "Generate",
                                            onClick = {
                                                val currentCredits = user?.credits ?: 0
                                                if (currentCredits >= style.tokensRequired) {
                                                    onTryStyleClick(style.id)
                                                } else {
                                                    showInsufficientCreditsSheet = true
                                                }
                                            },
                                            modifier = Modifier.width(140.dp).height(48.dp),
                                            shadowElevation = 0.dp
                                        )
                                    }
                                }
                            }
                            
                            Spacer(modifier = Modifier.height(140.dp)) // Extra space to scroll past the ad banner
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
                                    tint = if (style.isFavorite) Color.Red else Color(0xFF1F2937)
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
