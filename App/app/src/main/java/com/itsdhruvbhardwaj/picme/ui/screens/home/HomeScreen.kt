package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.compose.material3.MaterialTheme

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    authViewModel: AuthViewModel,
    viewModel: HomeViewModel,
    onStyleClick: (String) -> Unit,
    onSeeAllClick: (String?) -> Unit,
    onProfileClick: () -> Unit,
    isRefreshing: Boolean = false,
    onRefresh: () -> Unit = { viewModel.loadHomeData() },
    tourActive: Boolean = false
) {
    val uiState by viewModel.uiState.collectAsState()
    val adConfig by com.itsdhruvbhardwaj.picme.utils.AdPolicy.config.collectAsState()
    val nativeEnabled = adConfig.enabled && adConfig.nativeHomeEnabled && !tourActive
    val nativeSlots = rememberNativeFeedSlots(nativeEnabled,2,adConfig.homeNativeEverySections)
    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    LaunchedEffect(tourActive) { if (tourActive) listState.scrollToItem(0) }
    val autoRetrying by viewModel.isAutoRetrying.collectAsState()
    ObserveHomeRecovery(viewModel)
    val authState by authViewModel.authState.collectAsState()

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

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
            PullToRefreshBox(
                isRefreshing = isRefreshing,
                onRefresh = onRefresh,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = innerPadding.calculateTopPadding())
            ) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 100.dp)
                ) {
                    when (val state = uiState) {
                        HomeUiState.Loading -> items(3) { SectionSkeleton() }
                        is HomeUiState.Error -> item {
                            Box(Modifier.fillParentMaxSize()) {
                                HomeErrorState(message = if (autoRetrying) "Connection interrupted. Reconnecting automatically…" else state.message, onRetry = onRefresh)
                            }
                        }
                        is HomeUiState.Success -> {
                            if (state.refreshError != null) item {
                                Text(if (autoRetrying) "Reconnecting automatically…" else state.refreshError, color = if (autoRetrying) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error,
                                    modifier = Modifier.padding(20.dp))
                            }
                            if (state.sections.isEmpty()) item {
                                Text("No styles available yet. Pull down to refresh.", modifier = Modifier.padding(24.dp))
                            }
                            itemsIndexed(state.sections, key = { _, section -> section.config.id }) { sectionIndex, sectionData ->
                                if (sectionData.styles == null) {
                                    SectionSkeleton()
                                } else if (sectionData.styles.isNotEmpty()) {
                                    HomeSectionRow(
                                        sectionData = sectionData,
                                        onStyleClick = onStyleClick,
                                        onSeeAllClick = onSeeAllClick,
                                        tourSection = sectionData.config.id == state.sections.firstOrNull { !it.styles.isNullOrEmpty() }?.config?.id,
                                        tourActive = tourActive
                                    )
                                }
                                if (nativeEnabled) {
                                    nativeFeedSlotIndex(sectionIndex,state.sections.size,adConfig.homeNativeEverySections,2)?.let { slotIndex ->
                                        NativeFeedAd(nativeSlots[slotIndex])
                                    }
                                }
                                if (sectionData.error != null) {
                                    TextButton(onClick = onRefresh) {
                                        Text("${sectionData.config.title}: couldn't refresh. Retry")
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

@Composable
fun HomeSectionRow(
    sectionData: HomeSectionData,
    onStyleClick: (String) -> Unit,
    onSeeAllClick: (String?) -> Unit,
    tourSection: Boolean = false,
    tourActive: Boolean = false
) {
    val rowState = androidx.compose.foundation.lazy.rememberLazyListState()
    LaunchedEffect(tourActive) { if (tourActive && tourSection) rowState.scrollToItem(0) }
    Column {
        SectionHeader(
            title = sectionData.config.title,
            onSeeAllClick = { onSeeAllClick(sectionData.config.slug) },
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            seeAllModifier = if (tourSection) Modifier.appTourTarget("see_all") else Modifier
        )
        LazyRow(
            state = rowState,
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(sectionData.styles!!, key = { it.id }) { style ->
                StyleCard(
                    name = style.name,
                    modifier = if (tourSection && style.id == sectionData.styles?.firstOrNull()?.id) Modifier.appTourTarget("style") else Modifier,
                    thumbnailUrl = style.thumbnail,
                    genderTag = style.genderTag,
                    onClick = { onStyleClick(style.id) },
                    width = 148.dp,
                    height = 208.dp,
                    internalPadding = PaddingValues(horizontal = 12.dp, vertical = 14.dp),
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
