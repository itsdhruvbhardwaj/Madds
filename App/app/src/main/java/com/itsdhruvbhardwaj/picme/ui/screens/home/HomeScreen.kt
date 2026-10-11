package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.*
import com.itsdhruvbhardwaj.picme.ui.theme.Background

@Composable
fun HomeScreen(
    authViewModel: AuthViewModel,
    viewModel: HomeViewModel,
    onStyleClick: (String) -> Unit,
    onSeeAllClick: (String?, String?) -> Unit,
    onProfileClick: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val authState by authViewModel.authState.collectAsState()
    var searchQuery by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf("All") }

    Scaffold(
        containerColor = Background,
        topBar = {
            HomeTopBar(
                authState = authState,
                onProfileClick = onProfileClick
            )
        }
    ) { innerPadding ->
        Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            when (val state = uiState) {
                is HomeUiState.Loading -> {
                    HomeSkeleton()
                }
                is HomeUiState.Error -> {
                    HomeErrorState(
                        message = state.message,
                        onRetry = { viewModel.loadHomeData() }
                    )
                }
                is HomeUiState.Success -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(bottom = 24.dp)
                    ) {
                        item {
                            PicMeSearchBar(
                                query = searchQuery,
                                onQueryChange = { searchQuery = it },
                                modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)
                            )
                        }

                        item {
                            HomeCategorySection(
                                categories = state.categories,
                                selectedCategory = selectedCategory,
                                onCategorySelected = { category ->
                                    selectedCategory = category
                                    onSeeAllClick(if (category == "All") null else category, null)
                                }
                            )
                        }

                        items(state.sections, key = { it.config.id }) { sectionData ->
                            if (sectionData.styles == null) {
                                // Individual section is still loading
                                SectionSkeleton()
                            } else if (sectionData.styles.isNotEmpty()) {
                                // Individual section loaded successfully
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

@Composable
fun HomeSectionRow(
    sectionData: HomeSectionData,
    onStyleClick: (String) -> Unit,
    onSeeAllClick: (String?, String?) -> Unit
) {
    Column {
        SectionHeader(
            title = sectionData.config.title,
            onSeeAllClick = {
                val collectionSlug = if (sectionData.config.type == "popular") "Popular" else sectionData.config.slug
                onSeeAllClick(null, collectionSlug)
            },
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp)
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(sectionData.styles!!, key = { it.id }) { style ->
                StyleCard(
                    name = style.name,
                    thumbnailUrl = style.thumbnail,
                    onClick = { onStyleClick(style.id) }
                )
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
    }
}

@Composable
fun HomeTopBar(
    authState: AuthState,
    onProfileClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(start = 24.dp, end = 24.dp, top = 12.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        PicMeLogo(fontSize = 28)
        
        Row(verticalAlignment = Alignment.CenterVertically) {
            val user = (authState as? AuthState.Authenticated)?.user
            if (user != null) {
                CreditBadge(credits = user.credits)
                Spacer(modifier = Modifier.width(12.dp))
            }
            
            Surface(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(Color(0xFFF3F4F6)),
                onClick = onProfileClick
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
                        val initials = user?.name?.take(2)?.uppercase() ?: "U"
                        Text(
                            text = initials,
                            style = MaterialTheme.typography.labelLarge.copy(
                                fontWeight = FontWeight.Bold,
                                color = Color.Gray
                              )
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun HomeCategorySection(
    categories: List<String>,
    selectedCategory: String,
    onCategorySelected: (String) -> Unit
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        items(categories) { category ->
            CategoryChip(
                name = category,
                isSelected = selectedCategory == category,
                onClick = { onCategorySelected(category) }
            )
        }
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
        Button(
            onClick = onRetry,
            shape = RoundedCornerShape(12.dp)
        ) {
            Text("Retry")
        }
    }
}
