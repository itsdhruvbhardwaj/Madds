package com.itsdhruvbhardwaj.picme.ui.components

import androidx.compose.material3.MaterialTheme

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState

/**
 * Shared branded purple header for primary destinations (Home, Favorites, Profile).
 * Globally centers the screen title and places branding on the left and account controls on the right.
 */
@Composable
fun PicMeMainHeader(
    title: String,
    authState: AuthState,
    onProfileClick: () -> Unit,
    actions: @Composable RowScope.() -> Unit = {}
) {
    val dividerColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.72f)
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 4.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        // Measure both edges before the center. This also reserves space for
        // optional actions, whose width changes with accessibility font settings.
        val headerHeight = with(androidx.compose.ui.platform.LocalDensity.current) {
            (24.sp.toDp() + 24.dp).coerceAtLeast(68.dp)
        }
        androidx.compose.ui.layout.Layout(
            modifier = Modifier.fillMaxWidth().statusBarsPadding().height(headerHeight)
                .padding(horizontal = 16.dp)
                .drawBehind {
                    val lineWidth = 1.dp.toPx()
                    drawLine(dividerColor,
                        androidx.compose.ui.geometry.Offset(0f, size.height - lineWidth / 2),
                        androidx.compose.ui.geometry.Offset(size.width, size.height - lineWidth / 2), lineWidth)
                },
            content = {
                androidx.compose.foundation.Image(
                    painter = androidx.compose.ui.res.painterResource(R.drawable.headername),
                    contentDescription = "Madds", modifier = Modifier.width(82.dp).height(30.dp),
                    contentScale = ContentScale.Fit
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    val user = (authState as? AuthState.Authenticated)?.user
                    Row(Modifier.weight(1f, fill = false), verticalAlignment = Alignment.CenterVertically) {
                        actions()
                    }
                    Spacer(Modifier.width(6.dp))
                    Surface(modifier = Modifier.size(38.dp), shape = CircleShape,
                        onClick = onProfileClick, color = Color.White.copy(alpha = .2f),
                        border = BorderStroke(1.dp, Color.White.copy(alpha = .3f))) {
                        Box(contentAlignment = Alignment.Center) {
                            ProfileAvatar(user, Modifier.fillMaxSize())
                        }
                    }
                }
                GenerationHeaderStatus(title, Modifier.fillMaxWidth())
            }
        ) { children, constraints ->
            val gap = 8.dp.roundToPx()
            val sideConstraints = constraints.copy(minWidth = 0, minHeight = 0,
                maxWidth = (constraints.maxWidth / 2 - gap).coerceAtLeast(0))
            val logo = children[0].measure(sideConstraints)
            val profile = children[1].measure(sideConstraints)
            val centerWidth = (constraints.maxWidth - 2 * (maxOf(logo.width, profile.width) + gap)).coerceAtLeast(0)
            val center = children[2].measure(constraints.copy(minWidth = centerWidth, maxWidth = centerWidth, minHeight = 0))
            layout(constraints.maxWidth, constraints.maxHeight) {
                logo.placeRelative(0, (constraints.maxHeight - logo.height) / 2)
                profile.placeRelative(constraints.maxWidth - profile.width, (constraints.maxHeight - profile.height) / 2)
                center.placeRelative((constraints.maxWidth - center.width) / 2, (constraints.maxHeight - center.height) / 2)
            }
        }
    }
}

/**
 * Shared compact glass header for secondary pages.
 * Floating pill-shaped capsule matching the design mockup.
 */
@Composable
fun PicMeCompactHeader(
    title: String,
    onBackClick: () -> Unit,
    actions: @Composable RowScope.() -> Unit = {}
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        // Match the system status bar to the active theme.
        Spacer(
            modifier = Modifier
                .fillMaxWidth()
                .windowInsetsTopHeight(WindowInsets.statusBars)
                .background(MaterialTheme.colorScheme.background)
        )

        // 2. Floating Pill
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp, bottom = 8.dp)
        ) {
            Surface(
                modifier = Modifier
                    .padding(horizontal = 16.dp)
                    .fillMaxWidth()
                    .height(56.dp)
                    .shadow(
                        elevation = 16.dp,
                        shape = CircleShape,
                        ambientColor = Color.Black.copy(alpha = 0.2f),
                        spotColor = Color.Black.copy(alpha = 0.25f)
                    ),
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surface,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 8.dp)
                ) {
                    // Left: Back button
                    IconButton(
                        onClick = onBackClick,
                        modifier = Modifier.align(Alignment.CenterStart)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(24.dp)
                        )
                    }

                    // Center: Globally centered title
                    Text(
                        text = title,
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(horizontal = 56.dp),
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.ExtraBold,
                            color = MaterialTheme.colorScheme.onSurface,
                            letterSpacing = 0.2.sp
                        ),
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    // Right: Optional actions
                    Row(
                        modifier = Modifier.align(Alignment.CenterEnd),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        actions()
                    }
                }
            }
        }
    }
}
