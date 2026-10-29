package com.itsdhruvbhardwaj.picme.ui.screens.search

import androidx.activity.compose.BackHandler
import androidx.compose.material3.MaterialTheme

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
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
    var query by rememberSaveable { mutableStateOf("") }
    var isSearchFocused by remember { mutableStateOf(false) }
    var wasImeVisible by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    var previousQuery by rememberSaveable { mutableStateOf<String?>(null) }
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val density = LocalDensity.current
    val imeVisible = WindowInsets.ime.getBottom(density) > 0
    val successState = uiState as? ExploreUiState.Success
    val suggestions = remember(successState?.styles) {
        successState?.styles.orEmpty()
            .filter { style -> style.collections.any { it.equals("Trending", true) || it.equals("Popular", true) } }
            .distinctBy { it.id }
            .take(3)
    }
    val showSuggestions = isSearchFocused && query.isBlank() && suggestions.isNotEmpty()

    BackHandler(enabled = isSearchFocused) {
        keyboardController?.hide()
        focusManager.clearFocus(force = true)
    }

    LaunchedEffect(imeVisible) {
        if (imeVisible) {
            wasImeVisible = true
        } else if (wasImeVisible) {
            wasImeVisible = false
            if (isSearchFocused) focusManager.clearFocus(force = true)
        }
    }

    LaunchedEffect(query) {
        viewModel.search(query)
        if (previousQuery != null && previousQuery != query) {
            listState.scrollToItem(0)
        }
        previousQuery = query
    }

    LaunchedEffect(listState, successState?.styles?.size, successState?.hasMore, successState?.isLoadingMore, successState?.loadMoreError, showSuggestions) {
        val state = successState ?: return@LaunchedEffect
        val groupCount = state.styles.chunked(6).size
        if (groupCount == 0 || !state.hasMore || state.isLoadingMore || state.loadMoreError != null) {
            return@LaunchedEffect
        }
        val headerItems = 1
        snapshotFlow {
            listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: -1
        }.collect { lastVisibleIndex ->
            if (lastVisibleIndex >= headerItems + groupCount - 1) {
                viewModel.loadNextPage()
            }
        }
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
                LazyColumn(
                    state = listState,
                    contentPadding = PaddingValues(bottom = 112.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                    modifier = Modifier.fillMaxSize()
                ) {
                    item(key = "explore-search") {
                        SearchField(
                            query = query,
                            onQueryChange = { query = it },
                            onFocusChanged = { isSearchFocused = it },
                            suggestions = suggestions,
                            showSuggestions = showSuggestions
                        )
                    }

                    when (val state = uiState) {
                        ExploreUiState.Loading -> item(key = "explore-loading") {
                            Box(
                                modifier = Modifier.fillParentMaxHeight(0.7f).fillMaxWidth(),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator()
                            }
                        }

                        is ExploreUiState.Error -> item(key = "explore-error") {
                            Column(
                                modifier = Modifier.fillParentMaxHeight(0.7f).fillMaxWidth(),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center
                            ) {
                                Text(state.message, color = MaterialTheme.colorScheme.error)
                                Spacer(modifier = Modifier.height(12.dp))
                                Button(onClick = { viewModel.retry() }) { Text("Retry") }
                            }
                        }

                        is ExploreUiState.Success -> {
                            val groups = state.styles.chunked(6)
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
                                item(key = "explore-loading-more") {
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
    onQueryChange: (String) -> Unit,
    onFocusChanged: (Boolean) -> Unit,
    suggestions: List<Style>,
    showSuggestions: Boolean
) {
    val screenWidth = LocalConfiguration.current.screenWidthDp.dp
    val density = LocalDensity.current
    Box(modifier = Modifier.fillMaxWidth()) {
        PicMeSearchBar(
            query = query,
            onQueryChange = onQueryChange,
            modifier = Modifier.padding(horizontal = 4.dp, vertical = 10.dp),
            height = 48.dp,
            showClearButton = true,
            onFocusChanged = onFocusChanged
        )

        if (showSuggestions) {
            Popup(
                alignment = Alignment.TopStart,
                offset = IntOffset(0, with(density) { 68.dp.roundToPx() }),
                properties = PopupProperties(focusable = false)
            ) {
                Surface(
                    modifier = Modifier
                        .width(screenWidth - 24.dp)
                        .padding(horizontal = 12.dp),
                    shape = RoundedCornerShape(16.dp),
                    color = MaterialTheme.colorScheme.surface,
                    border = androidx.compose.foundation.BorderStroke(
                        1.dp,
                        MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
                    ),
                    shadowElevation = 12.dp
                ) {
                    Column(modifier = Modifier.padding(vertical = 6.dp)) {
                        suggestions.forEachIndexed { index, style ->
                            TextButton(
                                onClick = { onQueryChange(style.name) },
                                modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
                                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    text = style.name,
                                    modifier = Modifier.fillMaxWidth(),
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1
                                )
                            }
                            if (index < suggestions.lastIndex) {
                                HorizontalDivider(
                                    modifier = Modifier.padding(horizontal = 16.dp),
                                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f),
                                    thickness = 1.dp
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
