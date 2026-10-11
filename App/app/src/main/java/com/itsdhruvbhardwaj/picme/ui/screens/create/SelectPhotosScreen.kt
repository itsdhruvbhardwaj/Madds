package com.itsdhruvbhardwaj.picme.ui.screens.create

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import com.itsdhruvbhardwaj.picme.ui.components.EmptyPhotoSlot
import com.itsdhruvbhardwaj.picme.ui.components.PicMeButton
import com.itsdhruvbhardwaj.picme.ui.components.SelectedPhotoCard
import com.itsdhruvbhardwaj.picme.ui.components.TipsCard
import com.itsdhruvbhardwaj.picme.ui.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SelectPhotosScreen(
    styleId: String,
    styleRepository: StyleRepository,
    onBackClick: () -> Unit,
    onContinueClick: (List<Uri>) -> Unit
) {
    val style = remember(styleId) { styleRepository.getStyleById(styleId) }
    val requiredCount = style?.imageCount ?: 1

    // State for selected photos. Initialize with nulls to represent empty slots.
    var selectedPhotos by remember { mutableStateOf(List<Uri?>(requiredCount) { null }) }
    
    // Index of the slot being filled or replaced. If -1, we try to fill any empty slot.
    var activeSlotIndex by remember { mutableIntStateOf(-1) }

    // Use PickMultipleVisualMedia if requiredCount > 1, else PickVisualMedia
    // However, PickMultipleVisualMedia handles maxItems. For 1, it behaves similarly.
    // We'll use PickVisualMedia for simplicity when interacting with single slots.
    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
        onResult = { uri ->
            if (uri != null && activeSlotIndex != -1) {
                val newList = selectedPhotos.toMutableList()
                newList[activeSlotIndex] = uri
                selectedPhotos = newList
            }
            activeSlotIndex = -1
        }
    )

    val selectedCount = selectedPhotos.count { it != null }
    val isComplete = selectedCount == requiredCount

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
            )
        },
        bottomBar = {
            Box(modifier = Modifier.padding(24.dp)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    if (!isComplete) {
                        Text(
                            text = "Please select $requiredCount photo${if (requiredCount > 1) "s" else ""} to continue",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(bottom = 8.dp),
                            textAlign = TextAlign.Center
                        )
                    }
                    PicMeButton(
                        text = "Continue",
                        onClick = { 
                            val uris = selectedPhotos.filterNotNull()
                            if (uris.size == requiredCount) {
                                onContinueClick(uris)
                            }
                        },
                        enabled = isComplete
                    )
                }
            }
        }
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 24.dp)
        ) {
            Text(
                text = "Select Your Photos",
                style = MaterialTheme.typography.headlineLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 28.sp
                )
            )
            
            Text(
                text = "Choose $requiredCount clear photo${if (requiredCount > 1) "s" else ""} for the best results",
                style = MaterialTheme.typography.bodyLarge,
                color = TextSecondary,
                modifier = Modifier.padding(top = 8.dp, bottom = 24.dp)
            )

            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                itemsIndexed(selectedPhotos) { index, uri ->
                    if (uri != null) {
                        SelectedPhotoCard(
                            uri = uri,
                            onRemove = {
                                val newList = selectedPhotos.toMutableList()
                                newList[index] = null
                                selectedPhotos = newList
                            },
                            onClick = {
                                activeSlotIndex = index
                                photoPickerLauncher.launch(
                                    PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                                )
                            }
                        )
                    } else {
                        EmptyPhotoSlot(onClick = {
                            activeSlotIndex = index
                            photoPickerLauncher.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                            )
                        })
                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            TipsCard(
                tips = listOf(
                    "Use clear, front-facing photos",
                    "Good lighting works best",
                    "Avoid sunglasses or heavy filters"
                )
            )
        }
    }
}
