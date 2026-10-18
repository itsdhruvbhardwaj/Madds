package com.itsdhruvbhardwaj.picme.ui.components

import android.app.Activity
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.theme.Primary

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
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Primary.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }

    Surface(
        color = Primary,
        shadowElevation = 8.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .height(64.dp)
                .padding(horizontal = 16.dp)
        ) {
            // Left: Branded Logo
            PicMeLogo(
                fontSize = 24,
                tint = Color.White,
                modifier = Modifier.align(Alignment.CenterStart)
            )

            // Center: Globally centered title with safe margins to prevent overlap
            Text(
                text = title,
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 88.dp),
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                    letterSpacing = 0.5.sp
                ),
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            // Right: Account/Credits + Actions + Profile Avatar
            Row(
                modifier = Modifier.align(Alignment.CenterEnd),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val user = (authState as? AuthState.Authenticated)?.user
                if (user != null) {
                    CreditBadge(credits = user.credits)
                    Spacer(modifier = Modifier.width(10.dp))
                }

                actions()

                Spacer(modifier = Modifier.width(6.dp))
                Surface(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(CircleShape),
                    onClick = onProfileClick,
                    color = Color.White.copy(alpha = 0.2f),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.3f))
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        if (user?.profileImage != null) {
                            AsyncImage(
                                model = ImageRequest.Builder(LocalContext.current)
                                    .data(user.profileImage)
                                    .crossfade(true)
                                    .build(),
                                contentDescription = null,
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop
                            )
                        } else {
                            val initials = user?.name?.split(" ")?.mapNotNull { it.firstOrNull() }?.joinToString("")?.take(2)?.uppercase() ?: "U"
                            Text(
                                text = initials,
                                style = MaterialTheme.typography.labelLarge.copy(
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                            )
                        }
                    }
                }
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
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Primary.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        // 1. Fixed Status Bar Background (Primary)
        Spacer(
            modifier = Modifier
                .fillMaxWidth()
                .windowInsetsTopHeight(WindowInsets.statusBars)
                .background(Primary)
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
                color = Color.White.copy(alpha = 0.35f), // Translucent glass fill matching bottom nav
                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.5f)) // Visible pill border matching bottom nav
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
                            tint = Color(0xFF1F2937),
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
                            color = Color(0xFF1F2937),
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
