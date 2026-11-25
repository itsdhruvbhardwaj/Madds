package com.itsdhruvbhardwaj.picme.ui.components

import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.itsdhruvbhardwaj.picme.ui.theme.Primary
import com.itsdhruvbhardwaj.picme.ui.theme.PrimaryLight
import com.itsdhruvbhardwaj.picme.ui.theme.TextSecondary

@Composable
fun StyleCard(
    name: String,
    thumbnailUrl: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    width: Dp = 168.dp,
    height: Dp = 236.dp,
    internalPadding: PaddingValues = PaddingValues(horizontal = 16.dp, vertical = 20.dp),
    genderTag: String? = null,
    aspectRatio: Float? = null,
    variantCount: Int = 0,
    galleryStyle: Boolean = false
) {
    val radius = if (galleryStyle) 8.dp else 16.dp
    Surface(
        modifier = modifier
            .then(
                if (aspectRatio != null) Modifier.aspectRatio(aspectRatio)
                else Modifier.width(width).height(height)
            )
            .shadow(
                elevation = if (galleryStyle) 0.dp else 12.dp,
                shape = RoundedCornerShape(radius),
                ambientColor = Color.Black.copy(alpha = 0.15f),
                spotColor = Color.Black.copy(alpha = 0.2f)
            )
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(radius),
        color = MaterialTheme.colorScheme.surface,
        border = if (galleryStyle) null else BorderStroke(0.5.dp, MaterialTheme.colorScheme.outline)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(thumbnailUrl)
                    .crossfade(true)
                    .build(),
                contentDescription = name,
                modifier = Modifier
                    .fillMaxSize()
                    .background(
                        brush = Brush.verticalGradient(
                            colors = listOf(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.surface)
                        )
                    ),
                contentScale = ContentScale.Crop
            )

            StyleGenderBadge(genderTag, Modifier.align(Alignment.TopStart).padding(8.dp))
            if (variantCount > 1) Text("$variantCount looks", color = Color.White, fontSize = 10.sp,
                modifier = Modifier.align(Alignment.TopEnd).padding(8.dp).clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = .65f)).padding(horizontal = 8.dp, vertical = 5.dp))

            // Premium Gradient Overlay
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .align(Alignment.BottomStart)
                    // Clip to bottom corners to prevent square edges from leaking outside the parent Surface shape
                    .clip(RoundedCornerShape(bottomStart = radius, bottomEnd = radius))
                    .background(
                        brush = Brush.verticalGradient(
                            colors = if (galleryStyle) listOf(Color.Black.copy(alpha = 0.65f), Color.Black.copy(alpha = 0.65f))
                                else listOf(Color.Transparent, Color.Black.copy(alpha = 0.6f)),
                            startY = 0f
                        )
                    )
                    .padding(if (galleryStyle) PaddingValues(5.dp) else internalPadding)
            ) {
                Column {
                    Text(
                        text = name,
                        style = if (galleryStyle) MaterialTheme.typography.labelSmall.copy(color = Color.White) else MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp,
                            color = Color.White,
                            letterSpacing = 0.5.sp
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
fun TipsCard(
    tips: List<String>,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(28.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
    ) {
        Column(modifier = Modifier.padding(24.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.Info,
                    contentDescription = null,
                    tint = Primary,
                    modifier = Modifier.size(22.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "Tips for better results:",
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold
                    ),
                    color = Primary
                )
            }
            Spacer(modifier = Modifier.height(14.dp))
            tips.forEach { tip ->
                Row(modifier = Modifier.padding(vertical = 5.dp)) {
                    Text(
                        text = "•",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                        modifier = Modifier.padding(end = 10.dp)
                    )
                    Text(
                        text = tip,
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary
                    )
                }
            }
        }
    }
}

@Composable
fun EmptyPhotoSlot(
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .width(100.dp)
            .aspectRatio(1f)
            .clip(RoundedCornerShape(20.dp))
            .background(Color.White.copy(alpha = 0.4f))
            .border(BorderStroke(1.dp, Color.White.copy(alpha = 0.5f)), RoundedCornerShape(20.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            imageVector = Icons.Default.Add,
            contentDescription = null,
            tint = Primary,
            modifier = Modifier.size(36.dp)
        )
    }
}

@Composable
fun SelectedPhotoCard(
    uri: Uri,
    onRemove: () -> Unit,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .width(100.dp)
            .aspectRatio(1f)
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
    ) {
        AsyncImage(
            model = ImageRequest.Builder(LocalContext.current)
                .data(uri)
                .crossfade(true)
                .build(),
            contentDescription = null,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )

        Surface(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(6.dp)
                .size(26.dp)
                .clickable(onClick = onRemove),
            shape = CircleShape,
            color = Color.Black.copy(alpha = 0.6f),
            contentColor = Color.White
        ) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = null,
                modifier = Modifier.padding(5.dp)
            )
        }
    }
}

@Composable
fun PicMeImagePlaceholder(
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(Color(0xFFE5E7EB), Color(0xFFF3F4F6))
                )
            ),
        contentAlignment = Alignment.Center
    ) {
        // Optional placeholder content
    }
}
