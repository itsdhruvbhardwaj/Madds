package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.itsdhruvbhardwaj.picme.ui.components.StyleCard
import com.itsdhruvbhardwaj.picme.ui.theme.Background

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StylesGridScreen(
    viewModel: StylesGridViewModel,
    onBackClick: () -> Unit,
    onStyleClick: (String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val gridState = rememberLazyGridState()

    Scaffold(
        containerColor = Background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "All Styles",
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold)
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Background)
            )
        }
    ) { innerPadding ->
        // Use only top padding to allow content to scroll behind overlay at the bottom
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(top = innerPadding.calculateTopPadding())
        ) {
            when (val state = uiState) {
                is StylesGridUiState.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                is StylesGridUiState.Error -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = state.message,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyLarge
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(onClick = { /* ViewModel could expose a retry method */ }) {
                            Text("Retry")
                        }
                    }
                }
                is StylesGridUiState.Success -> {
                    if (state.styles.isEmpty()) {
                        Text(
                            text = "No styles found",
                            modifier = Modifier.align(Alignment.Center)
                        )
                    } else {
                        LazyVerticalGrid(
                            state = gridState,
                            columns = GridCells.Fixed(3),
                            // Large bottom padding to ensure content can be scrolled above the overlay
                            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 16.dp, bottom = 160.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            itemsIndexed(
                                items = state.styles,
                                key = { _, style -> style.id }
                            ) { index, style ->
                                // Pagination trigger
                                if (index >= state.styles.size - 4 && !state.isNextPageLoading && state.hasMore) {
                                    LaunchedEffect(Unit) {
                                        viewModel.loadNextPage()
                                    }
                                }

                                StyleCard(
                                    name = style.name,
                                    thumbnailUrl = style.thumbnail,
                                    onClick = { onStyleClick(style.id) },
                                    modifier = Modifier.fillMaxWidth(),
                                    // Proportionally smaller dimensions and padding for 3-column grid
                                    width = Dp.Unspecified, // Allow grid to determine width
                                    height = 160.dp,
                                    internalPadding = PaddingValues(horizontal = 10.dp, vertical = 12.dp),
                                    actionButtonPadding = 8.dp,
                                    actionButtonSize = 24.dp
                                )
                            }

                            if (state.isNextPageLoading) {
                                item {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(16.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
