package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.*

@Composable
fun HomeScreen(
    authViewModel: AuthViewModel,
    viewModel: HomeViewModel,
    onStyleClick: (String) -> Unit,
    onSeeAllClick: (String?) -> Unit,
    onProfileClick: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val authState by authViewModel.authState.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        Image(
            painter = painterResource(id = R.drawable.glassmorphismwallpaper),
            contentDescription = null,
            modifier = Modifier.fillMaxSize().blur(20.dp),
            contentScale = ContentScale.Crop
        )
        Box(
            modifier = Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.15f))
        )

        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                PicMeMainHeader(
                    title = "Home",
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
                    HomeUiState.Loading -> HomeSkeleton()
                    is HomeUiState.Error -> HomeErrorState(
                        message = state.message,
                        onRetry = { viewModel.loadHomeData() }
                    )
                    is HomeUiState.Success -> {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(bottom = 100.dp)
                        ) {
                            items(state.sections, key = { it.config.id }) { sectionData ->
                                if (sectionData.styles == null) {
                                    SectionSkeleton()
                                } else if (sectionData.styles.isNotEmpty()) {
                                    HomeSectionRow(
                                        sectionData = sectionData,
                                        onStyleClick = onStyleClick,
                                        onSeeAllClick = onSeeAllClick
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

@Composable
fun HomeSectionRow(
    sectionData: HomeSectionData,
    onStyleClick: (String) -> Unit,
    onSeeAllClick: (String?) -> Unit
) {
    Column {
        SectionHeader(
            title = sectionData.config.title,
            onSeeAllClick = { onSeeAllClick(sectionData.config.slug) },
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(sectionData.styles!!, key = { it.id }) { style ->
                StyleCard(
                    name = style.name,
                    thumbnailUrl = style.thumbnail,
                    onClick = { onStyleClick(style.id) },
                    width = 148.dp,
                    height = 208.dp,
                    internalPadding = PaddingValues(horizontal = 12.dp, vertical = 14.dp),
                    actionButtonPadding = 10.dp,
                    actionButtonSize = 28.dp
                )
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
    }
}

@Composable
fun HomeErrorState(
    message: String,
    onRetry: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = message,
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.padding(horizontal = 32.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            style = MaterialTheme.typography.bodyLarge
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onRetry, shape = RoundedCornerShape(12.dp)) {
            Text("Retry")
        }
    }
}
