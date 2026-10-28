package com.itsdhruvbhardwaj.picme.ui.screens.create

import androidx.compose.material3.MaterialTheme

import android.app.Activity
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.*
import com.itsdhruvbhardwaj.picme.ui.theme.Primary
import com.itsdhruvbhardwaj.picme.ui.theme.TextSecondary
import com.itsdhruvbhardwaj.picme.utils.AdManager

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateScreen(
    authViewModel: AuthViewModel,
    onGenerateClick: (String, List<Uri>) -> Unit,
    onProfileClick: () -> Unit
) {
    val authState by authViewModel.authState.collectAsState()
    val context = LocalContext.current
    var prompt by remember { mutableStateOf("") }
    var selectedPhotos by remember { mutableStateOf<List<Uri>>(emptyList()) }

    val photoPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
        onResult = { uri ->
            if (uri != null && selectedPhotos.size < 2) {
                selectedPhotos = selectedPhotos + uri
            }
        }
    )

    val wordCount = remember(prompt) {
        if (prompt.isBlank()) 0 else prompt.trim().split("\\s+".toRegex()).size
    }
    val isPromptValid = wordCount in 1..150

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                PicMeMainHeader(
                    title = "AI Creator",
                    authState = authState,
                    onProfileClick = onProfileClick
                )
            },
            bottomBar = {
                Box(modifier = Modifier.padding(24.dp).padding(bottom = 80.dp)) {
                    PicMeButton(
                        text = "Generate (10 Credits)",
                        onClick = {
                            val activity = context as? Activity
                            if (activity != null) {
                                AdManager.showInterstitial(activity) {
                                    onGenerateClick(prompt, selectedPhotos)
                                }
                            } else {
                                onGenerateClick(prompt, selectedPhotos)
                            }
                        },
                        enabled = isPromptValid,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        ) { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = innerPadding.calculateTopPadding())
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp)
            ) {
                Spacer(modifier = Modifier.height(24.dp))

                Text(
                    text = "Describe your vision",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Black),
                    color = Color(0xFF1E293B)
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Custom Prompt TextField with word count
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(24.dp))
                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(24.dp))
                        .padding(4.dp)
                ) {
                    Column {
                        TextField(
                            value = prompt,
                            onValueChange = { if (it.length <= 1000) prompt = it },
                            placeholder = { Text("e.g., A futuristic cyberpunk city with neon lights and flying cars...", color = TextSecondary.copy(alpha = 0.6f)) },
                            modifier = Modifier.fillMaxWidth().height(160.dp),
                            colors = TextFieldDefaults.colors(
                                focusedContainerColor = Color.Transparent,
                                unfocusedContainerColor = Color.Transparent,
                                disabledContainerColor = Color.Transparent,
                                focusedIndicatorColor = Color.Transparent,
                                unfocusedIndicatorColor = Color.Transparent
                            ),
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done)
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.End
                        ) {
                            Text(
                                text = "$wordCount/150 words",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (wordCount > 150) MaterialTheme.colorScheme.error else TextSecondary
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(32.dp))

                Text(
                    text = "Reference Photos (Optional)",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    color = Color(0xFF1E293B)
                )
                Text(
                    text = "Add up to 2 photos to guide the AI",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary,
                    modifier = Modifier.padding(bottom = 16.dp)
                )

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    selectedPhotos.forEachIndexed { index, uri ->
                        SelectedPhotoCard(
                            uri = uri,
                            onRemove = { selectedPhotos = selectedPhotos.filterIndexed { i, _ -> i != index } },
                            onClick = { /* View image? */ }
                        )
                    }
                    if (selectedPhotos.size < 2) {
                        EmptyPhotoSlot(onClick = {
                            photoPickerLauncher.launch(
                                PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                            )
                        })
                    }
                }

                Spacer(modifier = Modifier.height(32.dp))

                TipsCard(
                    tips = listOf(
                        "Be specific about colors and lighting",
                        "Describe the mood or art style",
                        "Reference photos help with composition"
                    )
                )

                Spacer(modifier = Modifier.height(140.dp))
            }
        }
    }
}
