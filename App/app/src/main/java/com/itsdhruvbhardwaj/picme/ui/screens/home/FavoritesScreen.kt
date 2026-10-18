package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.PicMeMainHeader
import com.itsdhruvbhardwaj.picme.ui.components.StyleCard
import com.itsdhruvbhardwaj.picme.ui.theme.Primary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FavoritesScreen(
    authViewModel: AuthViewModel,
    viewModel: FavoritesViewModel,
    onStyleClick: (String) -> Unit,
    onProfileClick: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val authState by authViewModel.authState.collectAsState()
    val isAuthenticated = authState is AuthState.Authenticated

    LaunchedEffect(isAuthenticated) {
        if (isAuthenticated) {
            viewModel.loadFavorites()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // Shared Glassmorphism Background
        Image(
            painter = painterResource(id = R.drawable.glassmorphismwallpaper),
            contentDescription = null,
            modifier = Modifier
                .fillMaxSize()
                .blur(20.dp),
            contentScale = ContentScale.Crop
        )
        
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.White.copy(alpha = 0.15f))
        )

        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                PicMeMainHeader(
                    title = "My Favorites",
                    authState = authState,
                    onProfileClick = onProfileClick
                )
            }
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = innerPadding.calculateTopPadding())
            ) {
                when (val state = uiState) {
                    is FavoritesUiState.Loading -> {
                        CircularProgressIndicator(
                            modifier = Modifier.align(Alignment.Center),
                            color = Primary
                        )
                    }
                    is FavoritesUiState.Error -> {
                        Column(
                            modifier = Modifier.align(Alignment.Center),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(text = state.message, color = MaterialTheme.colorScheme.error)
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(onClick = { viewModel.loadFavorites() }) {
                                Text("Retry")
                            }
                        }
                    }
                    is FavoritesUiState.Success -> {
                        if (state.styles.isEmpty()) {
                            Column(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .padding(32.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Favorite,
                                    contentDescription = null,
                                    modifier = Modifier.size(100.dp).alpha(0.1f),
                                    tint = Color.Gray
                                )
                                Spacer(modifier = Modifier.height(24.dp))
                                Text(
                                    text = "No favorites yet",
                                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                                    textAlign = TextAlign.Center
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = "Styles you heart will appear here",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Color.Gray,
                                    textAlign = TextAlign.Center
                                )
                            }
                        } else {
                            LazyVerticalGrid(
                                columns = GridCells.Fixed(3),
                                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 16.dp, bottom = 120.dp),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                                modifier = Modifier.fillMaxSize()
                            ) {
                                items(state.styles, key = { it.id }) { style ->
                                    StyleCard(
                                        name = style.name,
                                        thumbnailUrl = style.thumbnail,
                                        onClick = { onStyleClick(style.id) },
                                        modifier = Modifier.fillMaxWidth(),
                                        width = Dp.Unspecified,
                                        height = 160.dp,
                                        internalPadding = PaddingValues(horizontal = 10.dp, vertical = 12.dp),
                                        actionButtonPadding = 8.dp,
                                        actionButtonSize = 24.dp
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
