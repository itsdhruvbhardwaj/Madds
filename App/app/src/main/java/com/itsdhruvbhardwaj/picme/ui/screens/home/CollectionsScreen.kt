package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.itsdhruvbhardwaj.picme.data.model.StyleCollection
import com.itsdhruvbhardwaj.picme.data.repository.StyleRepository
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.PicMeMainHeader
import kotlinx.coroutines.launch
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

private data class CollectionCard(
    val collection: StyleCollection,
    val coverUrl: String,
    val styleCount: Int
)

@Composable
fun CollectionsScreen(
    authViewModel: AuthViewModel,
    styleRepository: StyleRepository,
    onCollectionClick: (String) -> Unit,
    onProfileClick: () -> Unit
) {
    val authState by authViewModel.authState.collectAsState()
    val scope = rememberCoroutineScope()
    var collections by remember { mutableStateOf<List<CollectionCard>?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }

    fun loadCollections() {
        scope.launch {
            loadError = null
            val result = styleRepository.getCollections()
            result.onSuccess { availableCollections ->
                try {
                    collections = coroutineScope {
                        availableCollections.map { collection ->
                            async {
                                val stylesResult = styleRepository.getStyles(
                                    page = 1,
                                    limit = 1,
                                    collection = collection.name
                                )
                                val response = stylesResult.getOrThrow()
                                val firstStyle = response.styles.firstOrNull()
                                firstStyle?.let { style ->
                                    CollectionCard(
                                        collection = collection,
                                        coverUrl = style.thumbnail?.takeIf(String::isNotBlank)
                                            ?: style.previewImages?.firstOrNull().orEmpty(),
                                        styleCount = response.pagination.totalCount
                                    )
                                }
                            }
                        }.awaitAll().filterNotNull()
                    }
                } catch (error: Exception) {
                    loadError = error.message ?: "Please check your connection and try again."
                }
            }.onFailure {
                loadError = it.message ?: "Please check your connection and try again."
            }
        }
    }

    LaunchedEffect(styleRepository) {
        loadCollections()
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            PicMeMainHeader(
                title = "Collections",
                authState = authState,
                onProfileClick = onProfileClick
            )
        }
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(top = innerPadding.calculateTopPadding())
        ) {
            val loadedCollections = collections
            when {
                loadedCollections == null && loadError == null -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                loadError != null -> Column(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Couldn't load collections", color = MaterialTheme.colorScheme.onBackground)
                    Text(
                        loadError.orEmpty().replace('_', ' '),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 6.dp)
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(onClick = { loadCollections() }) { Text("Try again") }
                }
                loadedCollections.isNullOrEmpty() -> Text(
                    "No collections available yet",
                    modifier = Modifier.align(Alignment.Center),
                    color = MaterialTheme.colorScheme.onBackground
                )
                else -> LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 104.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Text(
                            text = "Explore all styles by collection",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(start = 4.dp, bottom = 4.dp)
                        )
                    }
                    items(loadedCollections, key = { it.collection.id }) { item ->
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(1f)
                                .clip(RoundedCornerShape(16.dp))
                                .clickable { onCollectionClick(item.collection.name) }
                        ) {
                            AsyncImage(
                                model = item.coverUrl,
                                contentDescription = "${item.collection.name} collection cover",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.fillMaxSize()
                            )
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(88.dp)
                                    .align(Alignment.BottomCenter)
                                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.82f))))
                            )
                            Column(
                                modifier = Modifier.align(Alignment.BottomStart).padding(12.dp)
                            ) {
                                Text(
                                    text = item.collection.name,
                                    color = Color.White,
                                    style = MaterialTheme.typography.titleSmall,
                                    maxLines = 2
                                )
                                Text(
                                    text = "${item.styleCount} ${if (item.styleCount == 1) "style" else "styles"}",
                                    color = Color.White.copy(alpha = 0.78f),
                                    style = MaterialTheme.typography.labelSmall
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
