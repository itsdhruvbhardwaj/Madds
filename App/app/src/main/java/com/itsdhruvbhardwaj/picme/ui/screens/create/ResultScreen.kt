package com.itsdhruvbhardwaj.picme.ui.screens.create

import android.util.Base64
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
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
                    .clip(MaterialTheme.shapes.extraLarge),
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
}
