package com.itsdhruvbhardwaj.picme.ui.components

import android.os.SystemClock
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.core.tween
import androidx.compose.ui.draw.clip
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect
import kotlinx.coroutines.delay
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

@Stable
class DockInteractionState {
    var lastTouchAt by mutableLongStateOf(SystemClock.elapsedRealtime())
    var touching by mutableStateOf(false)
}

/** Translucent edge dock. Vertical dragging is bounded clear of the header and navigation. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StyleActionDock(
    credits: Int,
    preference: String,
    hazeState: HazeState,
    interaction: DockInteractionState,
    onBuyCredits: () -> Unit,
    onApply: suspend (String) -> Result<Unit>,
    onApplied: () -> Unit = {},
    tourActive: Boolean = false,
    onPreferencesVisibleChanged: (Boolean) -> Unit = {},
    modifier: Modifier = Modifier
) {
    val gold = Color(0xFFE1C477)
    var expanded by rememberSaveable { mutableStateOf(false) }
    val expansion by animateFloatAsState(
        targetValue = if (expanded) 1f else 0f,
        animationSpec = tween(180, easing = FastOutSlowInEasing), label = "dockMorph"
    )
    DisposableEffect(tourActive) {
        val previous = expanded
        if (tourActive) expanded = true
        onDispose { if (tourActive) expanded = previous }
    }
    var position by rememberSaveable { mutableFloatStateOf(.5f) }
    var showPreferences by rememberSaveable { mutableStateOf(false) }
    DisposableEffect(showPreferences) {
        onPreferencesVisibleChanged(showPreferences)
        onDispose { onPreferencesVisibleChanged(false) }
    }
    var visible by remember { mutableStateOf(true) }
    var localInteractionAt by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    var dragging by remember { mutableStateOf(false) }
    fun interact() { localInteractionAt = SystemClock.elapsedRealtime() }
    LaunchedEffect(interaction.lastTouchAt, localInteractionAt, interaction.touching, dragging, showPreferences, tourActive) {
        visible = true
        if (!tourActive && !interaction.touching && !dragging && !showPreferences) {
            delay(4_000)
            visible = false
        }
    }
    BoxWithConstraints(modifier.fillMaxSize().padding(top = 120.dp, bottom = 100.dp)) {
        val density = LocalDensity.current
        var dockHeight by remember { mutableIntStateOf(0) }
        val closedHeight = with(density) { 64.dp.toPx() }
        val availableHeight = with(density) { maxHeight.toPx() }
        val travel = (availableHeight - closedHeight).coerceAtLeast(0f)
        val shape = RoundedCornerShape(topStart = 24.dp, bottomStart = 24.dp)
        AnimatedVisibility(
            visible = visible,
            modifier = Modifier.align(Alignment.TopEnd)
                .offset { IntOffset(0, (travel * position + closedHeight - dockHeight).coerceIn(0f, (availableHeight - dockHeight).coerceAtLeast(0f)).roundToInt()) },
            enter = slideInHorizontally(tween(240)) { it },
            exit = slideOutHorizontally(tween(240)) { it }
        ) {
            MorphingDock(
                progress = expansion,
                expanded = expanded,
                onToggle = { interact(); expanded = !expanded },
                modifier = Modifier
                    .appTourTarget("dock")
                    .onSizeChanged { dockHeight = it.height }
                    .actionGlass(hazeState, shape)
                    .pointerInput(travel) {
                        detectVerticalDragGestures(
                            onDragStart = { dragging = true; interact() },
                            onDragEnd = { dragging = false; interact() },
                            onDragCancel = { dragging = false; interact() }
                        ) { change, delta ->
                            change.consume()
                            if (travel > 0) position = (position + delta / travel).coerceIn(0f, 1f)
                        }
                    }
                    .semantics {
                        stateDescription = if (expanded) "Expanded action bar" else "Collapsed action bar"
                        customActions = listOf(
                            CustomAccessibilityAction("Move up") { interact(); position = (position - .15f).coerceAtLeast(0f); true },
                            CustomAccessibilityAction("Move down") { interact(); position = (position + .15f).coerceAtMost(1f); true }
                        )
                    }
            ) {
                Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("•••", color = Color.White.copy(alpha = .45f), fontSize = 10.sp, maxLines = 1)
                    Column(Modifier.fillMaxWidth().clickable(enabled = expanded) { interact(); onBuyCredits() }.padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Outlined.Toll, "Buy credits", tint = Color.White, modifier = Modifier.size(22.dp))
                        Text(credits.toString(), color = Color.White, fontSize = 16.sp, maxLines = 1)
                        Text("Credits", color = Color.White.copy(alpha = .75f), fontSize = 10.sp, maxLines = 1)
                    }
                    HorizontalDivider(Modifier.padding(horizontal = 14.dp), color = Color.White.copy(alpha = .2f))
                    Column(Modifier.fillMaxWidth().clickable(enabled = expanded) { interact(); showPreferences = true }.padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Outlined.Tune, "Style preference", tint = Color.White, modifier = Modifier.size(22.dp))
                        Text("Filter", color = Color.White, fontSize = 11.sp)
                        Text(when(preference) { "male" -> "For Him"; "female" -> "For Her"; else -> "Everyone" }, color = Color.White.copy(alpha = .7f), fontSize = 9.sp, maxLines = 1)
                    }
                    IconButton(enabled = expanded, onClick = { interact(); expanded = false }, modifier = Modifier.height(40.dp).fillMaxWidth()) {
                        Icon(Icons.Outlined.KeyboardArrowDown, "Collapse action bar", tint = Color.White, modifier = Modifier.size(22.dp))
                    }
                }
            }
        }
    }
    if (showPreferences) {
        var selected by remember(preference) { mutableStateOf(preference) }
        var saving by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }
        val scope = rememberCoroutineScope()
        ModalBottomSheet(onDismissRequest = { if (!saving) showPreferences = false }, containerColor = Color(0xFF171A18)) {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(horizontal = 24.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Style preference", style = MaterialTheme.typography.headlineSmall, color = Color.White, modifier = Modifier.align(Alignment.CenterHorizontally))
                Text("Choose the styles you want to see.", color = Color.LightGray)
                listOf("male" to "For Him", "female" to "For Her", "all" to "For Everyone").forEach { (value, label) ->
                    Row(Modifier.fillMaxWidth().border(1.dp, if (selected == value) gold else Color.White.copy(alpha = .15f), RoundedCornerShape(18.dp))
                        .background(if (selected == value) gold.copy(alpha = .1f) else Color.Transparent, RoundedCornerShape(18.dp))
                        .clickable(enabled = !saving) { selected = value; error = null }.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(label, color = Color.White, modifier = Modifier.weight(1f))
                        RadioButton(selected == value, onClick = null, enabled = !saving, colors = RadioButtonDefaults.colors(selectedColor = gold))
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Button(enabled = !saving, onClick = {
                    saving = true
                    scope.launch {
                        val result = onApply(selected)
                        saving = false
                        result.fold(onSuccess = { showPreferences = false; onApplied() }, onFailure = { error = it.message })
                    }
                }, colors = ButtonDefaults.buttonColors(containerColor = gold, contentColor = Color.Black), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                    Text(if (saving) "Saving…" else "Apply preference")
                }
                Text(when(selected) {
                    "male" -> "Male styles and styles suitable for everyone will be shown."
                    "female" -> "Female styles and styles suitable for everyone will be shown."
                    else -> "All styles will be shown, including male, female, and universal styles."
                }, color = Color.LightGray, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}


/** Both layouts keep their bottom-right corner at the handle while the glass shell morphs. */
@Composable
private fun MorphingDock(
    progress: Float,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    panel: @Composable () -> Unit
) {
    Layout(modifier = modifier, content = {
        Box(Modifier
            .then(if (!expanded) Modifier.clearAndSetSemantics { } else Modifier)
            .graphicsLayer {
                transformOrigin = TransformOrigin(1f, 1f)
                scaleX = .44f + .56f * progress
                scaleY = .22f + .78f * progress
                alpha = progress * progress
            }) { panel() }
        Column(Modifier
            .then(if (expanded) Modifier.clearAndSetSemantics { } else Modifier)
            .graphicsLayer { alpha = 1f - progress }
            .clickable(enabled = !expanded, onClickLabel = "Expand action bar upward", onClick = onToggle),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text("•••", color = Color.White.copy(alpha = .45f), fontSize = 10.sp, maxLines = 1)
            Icon(Icons.Outlined.KeyboardArrowUp, "Expand action bar upward", tint = Color.White, modifier = Modifier.size(22.dp))
        }
    }) { children, constraints ->
        val fullWidth = 72.dp.roundToPx().coerceAtMost(constraints.maxWidth)
        val handleWidth = 32.dp.roundToPx().coerceAtMost(fullWidth)
        val handleHeight = 64.dp.roundToPx().coerceAtMost(constraints.maxHeight)
        val full = children[0].measure(Constraints(minWidth = fullWidth, maxWidth = fullWidth, maxHeight = constraints.maxHeight))
        val handle = children[1].measure(Constraints.fixed(handleWidth, handleHeight))
        val width = (handleWidth + (full.width - handleWidth) * progress).roundToInt()
        val height = (handleHeight + (full.height - handleHeight) * progress).roundToInt()
        layout(width, height) {
            if (progress > 0f) full.place(width - full.width, height - full.height)
            if (progress < 1f) handle.place(width - handle.width, height - handle.height)
        }
    }
}
