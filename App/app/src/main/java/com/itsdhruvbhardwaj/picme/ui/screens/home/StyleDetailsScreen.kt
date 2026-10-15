package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.InsufficientCreditsBottomSheet
import com.itsdhruvbhardwaj.picme.ui.components.PicMeButton
import com.itsdhruvbhardwaj.picme.ui.components.TipsCard
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
    
    var showInsufficientCreditsSheet by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    if (uiState is StyleDetailsUiState.Success) {
                        Text(
                            text = (uiState as StyleDetailsUiState.Success).style.name,
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { /* Favorite action */ }) {
                        Icon(Icons.Default.FavoriteBorder, contentDescription = "Favorite")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White,
                    titleContentColor = Color.Black,
                    navigationIconContentColor = Color.Black,
                    actionIconContentColor = Color.Black
                ),
                windowInsets = TopAppBarDefaults.windowInsets
            )
        },
        bottomBar = {
            if (uiState is StyleDetailsUiState.Success) {
                val style = (uiState as StyleDetailsUiState.Success).style
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shadowElevation = 16.dp,
                    color = Color.White
                ) {
                    Column {
                        HorizontalDivider(color = Color(0xFFF3F4F6), thickness = 1.dp)
                        Row(
                            modifier = Modifier
                                .padding(horizontal = 24.dp, vertical = 12.dp)
                                .navigationBarsPadding(),
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
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
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
                                text = "Try This Style",
                                onClick = {
                                    val currentCredits = user?.credits ?: 0
                                    if (currentCredits >= style.tokensRequired) {
                                        onTryStyleClick(style.id)
                                    } else {
                                        showInsufficientCreditsSheet = true
                                    }
                                },
                                modifier = Modifier.width(160.dp)
                            )
                        }
                    }
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.White)
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
        ) {
            if (uiState is StyleDetailsUiState.Success) {
                val style = (uiState as StyleDetailsUiState.Success).style
                
                // 1. Hero Image - Prominent and taller to fill vertical space
                AsyncImage(
                    model = ImageRequest.Builder(LocalContext.current)
                        .data(style.thumbnail)
                        .crossfade(true)
                        .build(),
                    contentDescription = style.name,
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1.0f) // Square aspect ratio to occupy more vertical space
                        .padding(horizontal = 24.dp)
                        .padding(top = 12.dp)
                        .clip(RoundedCornerShape(32.dp))
                        .background(Color(0xFFF3F4F6)),
                    contentScale = ContentScale.Crop
                )
                
                Spacer(modifier = Modifier.height(32.dp))
                
                Column(
                    modifier = Modifier.padding(horizontal = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(24.dp) // Generous gaps to avoid clustering
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
                                fontWeight = FontWeight.Bold,
                                fontSize = 26.sp
                            ),
                            modifier = Modifier.weight(1f)
                        )
                        
                        Surface(
                            color = Color(0xFFF3F4F6),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                text = style.category,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                            )
                        }
                    }
                    
                    // Description
                    Text(
                        text = style.description,
                        style = MaterialTheme.typography.bodyLarge,
                        color = TextSecondary,
                        lineHeight = 24.sp
                    )
                    
                    // Compact Tips Card
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
                                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
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
                                            .clip(RoundedCornerShape(20.dp))
                                            .background(Color(0xFFF3F4F6)),
                                        contentScale = ContentScale.Crop
                                    )
                                }
                            }
                        }
                    }
                }
                
                // Final bottom spacing
                Spacer(modifier = Modifier.height(32.dp))
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
