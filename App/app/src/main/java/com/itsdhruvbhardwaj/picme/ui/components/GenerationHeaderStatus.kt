package com.itsdhruvbhardwaj.picme.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration
import kotlinx.coroutines.delay

data class GenerationHeaderState(
    val items: List<RecoverableGeneration> = emptyList(),
    val onOpen: (String) -> Unit = {}
)

val LocalGenerationHeaderState = staticCompositionLocalOf { GenerationHeaderState() }

internal fun generationStatusGroup(status: String): String = when (status) {
    "completed" -> "ready"
    "failed" -> "failed"
    "outcome_unknown" -> "review"
    "checking", "submitting" -> "checking"
    else -> "creating"
}

internal fun generationStatusLabel(group: String, count: Int): String = when (group) {
    "ready" -> if (count == 1) "Photo ready" else "$count photos ready"
    "failed" -> if (count == 1) "Generation failed" else "$count failed"
    "review" -> "Needs review"
    "checking" -> "Checking status"
    else -> if (count == 1) "Creating photo" else "Creating $count photos"
}

@Composable
fun GenerationHeaderStatus(title: String, modifier: Modifier = Modifier) {
    val state = LocalGenerationHeaderState.current
    val groups = state.items.groupBy { generationStatusGroup(it.status) }
    val keys = listOf("title") + listOf("creating", "checking", "ready", "failed", "review").filter { it in groups }
    var index by remember(keys) { mutableIntStateOf(0) }
    var showList by remember { mutableStateOf(false) }
    val lifecycle = LocalLifecycleOwner.current
    LaunchedEffect(keys, lifecycle) {
        lifecycle.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (keys.size > 1) {
                delay(if (index == 0) 3_000 else 5_000)
                index = (index + 1) % keys.size
            }
        }
    }
    val key = keys[index.coerceAtMost(keys.lastIndex)]
    val count = groups[key]?.size ?: 0
    // Snapshot each outgoing label so live polling cannot blank an exit animation.
    val target = Triple(key, count, if (key == "title") title else generationStatusLabel(key, count))
    val density = LocalDensity.current
    val viewportHeight = with(density) { (24.sp.toDp() + 8.dp).coerceAtLeast(56.dp) }
    val pillHeight = with(density) { (16.sp.toDp() + 16.dp).coerceAtLeast(42.dp) }
    Box(modifier.height(viewportHeight).clipToBounds(), contentAlignment = Alignment.Center) {
        AnimatedContent(targetState = target, contentKey = { it.first }, label = "generation header",
            modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center,
            transitionSpec = {
                (slideInVertically(tween(420)) { it } + fadeIn(tween(300))) togetherWith
                    (slideOutVertically(tween(420)) { -it } + fadeOut(tween(250))) using null
            }) { (group, _, label) ->
            // Identical frames prevent AnimatedContent from interpolating the narrow
            // title's width into the pill's width and shifting it sideways.
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            if (group == "title") {
                Text(label, textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        brush = com.itsdhruvbhardwaj.picme.ui.theme.MaddsPalette.goldShine,
                        letterSpacing = 0.25.sp
                    ), maxLines = 1, overflow = TextOverflow.Ellipsis)
            } else {
                val gold = MaterialTheme.colorScheme.primary
                Surface(onClick = {
                    if (state.items.size == 1) state.onOpen(state.items.first().id)
                    else if (state.items.isNotEmpty()) showList = true
                }, modifier = Modifier.fillMaxWidth().shadow(5.dp, CircleShape), shape = CircleShape,
                    color = MaterialTheme.colorScheme.surface.copy(alpha = .96f),
                    border = BorderStroke(.7.dp, Brush.verticalGradient(listOf(gold.copy(alpha = .75f),
                        gold.copy(alpha = .18f), gold.copy(alpha = .45f))))) {
                    Box(Modifier.fillMaxWidth().height(pillHeight)
                        .background(Brush.verticalGradient(listOf(Color.White.copy(alpha = .13f),
                            Color.White.copy(alpha = .025f), Color.Transparent, gold.copy(alpha = .07f))))
                        .padding(horizontal = 10.dp), contentAlignment = Alignment.Center) {
                        Box(Modifier.align(Alignment.CenterStart).size(16.dp), contentAlignment = Alignment.Center) {
                            when (group) {
                                "creating", "checking" -> CircularProgressIndicator(Modifier.size(14.dp), color = gold, strokeWidth = 1.5.dp)
                                else -> Icon(if (group == "ready") Icons.Outlined.CheckCircle else Icons.Outlined.Info,
                                    contentDescription = null, tint = gold, modifier = Modifier.size(16.dp))
                            }
                        }
                        Text(label, modifier = Modifier.fillMaxWidth().padding(horizontal = 22.dp),
                            textAlign = TextAlign.Center, color = gold, fontSize = 12.sp, lineHeight = 16.sp,
                            fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (group == "ready") Icon(Icons.Outlined.ChevronRight, null, tint = gold,
                            modifier = Modifier.align(Alignment.CenterEnd).size(12.dp))
                    }
                }
            }
            }
        }
    }
    if (showList && state.items.isNotEmpty()) {
        AlertDialog(onDismissRequest = { showList = false }, title = { Text("Your photos") }, text = {
            LazyColumn {
                items(state.items, key = { it.id }) { item ->
                    TextButton(onClick = { showList = false; state.onOpen(item.id) }, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(item.styleName, color = MaterialTheme.colorScheme.onSurface)
                            Text(generationStatusLabel(generationStatusGroup(item.status), 1), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    HorizontalDivider()
                }
            }
        }, confirmButton = { TextButton(onClick = { showList = false }) { Text("Close") } })
    }
}
