package com.itsdhruvbhardwaj.picme.ui.screens.search

import androidx.compose.material3.MaterialTheme

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.data.model.Style
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.PicMeMainHeader
import com.itsdhruvbhardwaj.picme.ui.components.PicMeSearchBar
import kotlinx.coroutines.flow.collect

@Composable
fun ExploreScreen(
    authViewModel: AuthViewModel,
    viewModel: ExploreViewModel,
    onStyleClick: (String) -> Unit,
    onProfileClick: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val authState by authViewModel.authState.collectAsState()
    var query by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(query) {
        viewModel.search(query)
        listState.scrollToItem(0)
    }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                PicMeMainHeader(
                    title = "Explore",
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
                    ExploreUiState.Loading -> {
                        Column(modifier = Modifier.fillMaxSize()) {
                            SearchField(query = query, onQueryChange = { query = it })
                            Box(
                                modifier = Modifier.weight(1f).fillMaxWidth(),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator()
                            }
                        }
                    }

                    is ExploreUiState.Error -> {
                        Column(modifier = Modifier.fillMaxSize()) {
                            SearchField(query = query, onQueryChange = { query = it })
                            Column(
                                modifier = Modifier.weight(1f).fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center
                            ) {
                                Text(state.message, color = MaterialTheme.colorScheme.error)
                                Spacer(modifier = Modifier.height(12.dp))
                                Button(onClick = { viewModel.retry() }) { Text("Retry") }
                            }
                        }
                    }

                    is ExploreUiState.Success -> {
                        val groups = state.styles.chunked(6)
                        LaunchedEffect(listState, groups.size, state.hasMore, state.isLoadingMore, state.loadMoreError) {
                            if (groups.isEmpty() || !state.hasMore || state.isLoadingMore || state.loadMoreError != null) {
                                return@LaunchedEffect
                            }
                            snapshotFlow {
                                listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1
                            }.collect { lastVisibleIndex ->
                                if (lastVisibleIndex >= groups.size - 1) {
                                    viewModel.loadNextPage()
                                }
                            }
                        }

                        LazyColumn(
                            state = listState,
                            contentPadding = PaddingValues(bottom = 112.dp),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            item(key = "explore-search") {
                                SearchField(query = query, onQueryChange = { query = it })
                            }

                            itemsIndexed(
                                items = groups,
                                key = { index, group -> "explore-" + group.firstOrNull()?.id.orEmpty() + "-" + index }
                            ) { index, group ->
                                ExploreMosaicBlock(
                                    styles = group,
                                    blockIndex = index,
                                    onStyleClick = onStyleClick
                                )
                            }

                            if (state.isLoadingMore) {
                                item(key = "explore-loading") {
                                    Box(
                                        modifier = Modifier.fillMaxWidth().padding(20.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        CircularProgressIndicator(modifier = Modifier.size(24.dp))
                                    }
                                }
                            } else if (state.loadMoreError != null) {
                                item(key = "explore-load-error") {
                                    TextButton(
                                        onClick = { viewModel.loadNextPage() },
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Text("Couldn't load more styles. Tap to retry.")
                                    }
                                }
                            }

                            if (groups.isEmpty()) {
                                item(key = "explore-empty") {
                                    Text(
                                        text = if (query.isBlank()) "No styles are available yet." else "No styles match your search.",
                                        modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
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
private fun SearchField(
    query: String,
    onQueryChange: (String) -> Unit
) {
    PicMeSearchBar(
        query = query,
        onQueryChange = onQueryChange,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
    )
}

@Composable
private fun ExploreMosaicBlock(
    styles: List<Style>,
    blockIndex: Int,
    onStyleClick: (String) -> Unit
) {
    val gap = 2.dp
    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val cellSize = (maxWidth - gap * 2) / 3
        val featureSize = cellSize * 2 + gap

        if (styles.size < 3) {
            Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                styles.forEach { style ->
                    ExploreTile(
                        style = style,
                        onClick = { onStyleClick(style.id) },
                        modifier = Modifier.size(cellSize)
                    )
                }
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(gap)) {
                Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                    if (blockIndex % 2 == 0) {
                        ExploreTile(
                            style = styles[0],
                            onClick = { onStyleClick(styles[0].id) },
                            modifier = Modifier.size(featureSize)
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(gap)) {
                            ExploreTile(
                                style = styles[1],
                                onClick = { onStyleClick(styles[1].id) },
                                modifier = Modifier.size(cellSize)
                            )
                            ExploreTile(
                                style = styles[2],
                                onClick = { onStyleClick(styles[2].id) },
                                modifier = Modifier.size(cellSize)
                            )
                        }
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(gap)) {
                            ExploreTile(
                                style = styles[1],
                                onClick = { onStyleClick(styles[1].id) },
                                modifier = Modifier.size(cellSize)
                            )
                            ExploreTile(
                                style = styles[2],
                                onClick = { onStyleClick(styles[2].id) },
                                modifier = Modifier.size(cellSize)
                            )
                        }
                        ExploreTile(
                            style = styles[0],
                            onClick = { onStyleClick(styles[0].id) },
                            modifier = Modifier.size(featureSize)
                        )
                    }
                }

                val remaining = styles.drop(3)
                if (remaining.isNotEmpty()) {
                    Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
                        remaining.forEach { style ->
                            ExploreTile(
                                style = style,
                                onClick = { onStyleClick(style.id) },
                                modifier = Modifier.size(cellSize)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ExploreTile(
    style: Style,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(2.dp))
            .background(Color(0xFFE8EAF0))
            .clickable(onClick = onClick)
    ) {
        AsyncImage(
            model = ImageRequest.Builder(LocalContext.current)
                .data(style.thumbnail)
                .crossfade(true)
                .build(),
            contentDescription = style.name,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Crop
        )
    }
}
