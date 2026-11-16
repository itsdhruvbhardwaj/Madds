package com.itsdhruvbhardwaj.picme.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.outlined.CardGiftcard
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.itsdhruvbhardwaj.picme.ui.screens.home.DailyRewardUiState
import com.itsdhruvbhardwaj.picme.ui.screens.home.DailyRewardViewModel
import com.itsdhruvbhardwaj.picme.ui.theme.Primary
import com.itsdhruvbhardwaj.picme.ui.theme.MaddsPalette
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.utils.AdPlacement
import com.itsdhruvbhardwaj.picme.utils.AdPolicy
import kotlinx.coroutines.delay

@Composable
fun DailyRewardHost(ownerId: String?, model: DailyRewardViewModel, homeActive: Boolean, safeToPrompt: () -> Boolean) {
    val process = remember { ProcessLifecycleOwner.get().lifecycle }
    val safe by rememberUpdatedState(safeToPrompt)
    val state by model.state.collectAsState()
    val adConfig by AdPolicy.config.collectAsState()
    LaunchedEffect(ownerId) { model.bindAccount(ownerId) }
    DisposableEffect(process, model) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_START) model.beginVisit()
            if (event == Lifecycle.Event.ON_STOP) model.endVisit()
        }
        process.addObserver(observer)
        if (process.currentState.isAtLeast(Lifecycle.State.STARTED)) model.beginVisit()
        onDispose { process.removeObserver(observer) }
    }
    LaunchedEffect(ownerId, homeActive, process) {
        if (!homeActive || ownerId == null) { model.dismiss(); return@LaunchedEffect }
        process.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) { model.checkVisit(safe()); delay(1000) }
        }
    }
    if (homeActive && state.popup && safe()) DailyRewardPopup(state, model::claimBonus, model::dismiss, adConfig.allows(AdPlacement.DAILY_BONUS_CLAIM))
}

@Composable
fun DailyBonusStrip(state: DailyRewardUiState, onClaim: () -> Unit) {
    val offer = state.offer ?: return
    if (!state.available || state.popup) return
    val colors = MaterialTheme.colorScheme
    val adConfig by AdPolicy.config.collectAsState()
    val mayShowAd = adConfig.allows(AdPlacement.DAILY_BONUS_CLAIM)
    Surface(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), shape = RoundedCornerShape(20.dp),
        color = colors.surface, tonalElevation = 0.dp,
        border = BorderStroke(1.dp, Brush.horizontalGradient(listOf(MaddsPalette.gold.copy(alpha = .28f), colors.outline.copy(alpha = .55f))))) {
        Column(Modifier.background(Brush.horizontalGradient(listOf(colors.surface, colors.background))).padding(12.dp)) {
            BoxWithConstraints(Modifier.fillMaxWidth()) {
                if (maxWidth < 270.dp || LocalDensity.current.fontScale > 1.3f) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) { DailyBonusSummary(offer.credits, mayShowAd) }
                        DailyBonusStripAction(state, onClaim, Modifier.fillMaxWidth())
                    }
                } else Row(verticalAlignment = Alignment.CenterVertically) {
                    DailyBonusSummary(offer.credits, mayShowAd)
                    Spacer(Modifier.width(12.dp))
                    DailyBonusStripAction(state, onClaim)
                }
            }
            state.error?.let { Text(it, color = colors.error, fontSize = 11.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 10.dp)) }
        }
    }
}

@Composable
private fun RowScope.DailyBonusSummary(credits: Int, mayShowAd: Boolean) {
    Box(Modifier.size(46.dp).background(Brush.radialGradient(listOf(MaddsPalette.gold.copy(alpha = .18f), Color.Transparent))), contentAlignment = Alignment.Center) {
        Image(painterResource(R.drawable.glossygoldcoin), contentDescription = null, modifier = Modifier.size(36.dp))
    }
    Spacer(Modifier.width(10.dp))
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text("Daily bonus", fontSize = 14.sp, lineHeight = 18.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
        Text("+$credits free ${if (credits == 1) "credit" else "credits"} today", fontSize = 11.sp, lineHeight = 15.sp, color = Primary)
        if (mayShowAd) Text("An ad may follow your claim", fontSize = 10.sp, lineHeight = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun DailyBonusStripAction(state: DailyRewardUiState, onClaim: () -> Unit, modifier: Modifier = Modifier) {
    val enabled = !state.claiming && !state.loading
    Button(onClick = onClaim, enabled = enabled, shape = CircleShape,
        modifier = modifier.widthIn(min = 88.dp).heightIn(min = 44.dp).clip(CircleShape)
            .background(Brush.horizontalGradient(listOf(MaddsPalette.goldSoft, MaddsPalette.gold).map { it.copy(alpha = if (enabled) 1f else .45f) })),
        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = MaddsPalette.goldOn,
            disabledContainerColor = Color.Transparent, disabledContentColor = MaddsPalette.goldOn.copy(alpha = .75f)),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 10.dp)) {
        if (state.claiming || state.loading) CircularProgressIndicator(Modifier.size(17.dp), color = MaddsPalette.goldOn, strokeWidth = 2.dp)
        else {
            Text("Claim", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.width(7.dp)); Icon(Icons.AutoMirrored.Filled.ArrowForward, null, modifier = Modifier.size(15.dp))
        }
    }
}

@Composable
private fun DailyRewardPopup(state: DailyRewardUiState, claim: () -> Unit, dismiss: () -> Unit, mayShowAd: Boolean) {
    val credits = state.offer?.credits ?: return
    val colors = MaterialTheme.colorScheme
    val enabled = !state.claiming && !state.loading
    val gold = MaddsPalette.gold
    Dialog(onDismissRequest = dismiss, properties = DialogProperties(
        usePlatformDefaultWidth = false,
        dismissOnBackPress = !state.claiming, dismissOnClickOutside = !state.claiming
    )) {
        Box(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 24.dp), contentAlignment = Alignment.Center) {
            Surface(
                modifier = Modifier.widthIn(max = 380.dp).fillMaxWidth(),
                shape = RoundedCornerShape(28.dp), color = colors.surface,
                border = BorderStroke(1.dp, Brush.linearGradient(listOf(colors.outline.copy(alpha = .65f), gold.copy(alpha = .4f), colors.outline.copy(alpha = .4f)))),
                tonalElevation = 0.dp, shadowElevation = 20.dp
            ) {
                Column(
                    Modifier.background(Brush.verticalGradient(listOf(colors.surface, colors.background)))
                        .verticalScroll(rememberScrollState()).padding(start = 24.dp, end = 24.dp, top = 26.dp, bottom = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        Icon(Icons.Outlined.CardGiftcard, null, tint = Primary, modifier = Modifier.size(15.dp))
                        Text("DAILY BONUS", color = Primary, fontSize = 10.sp, letterSpacing = 2.sp, fontWeight = FontWeight.SemiBold)
                    }
                    Spacer(Modifier.height(14.dp))
                    Text("A little gift for you", color = colors.onSurface, fontSize = 24.sp, lineHeight = 29.sp,
                        fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(6.dp))
                    Text("Make something new today.", fontSize = 13.sp, lineHeight = 19.sp,
                        textAlign = TextAlign.Center, color = colors.onSurfaceVariant)
                    Spacer(Modifier.height(22.dp))
                    Surface(
                        modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp),
                        color = gold.copy(alpha = .055f), border = BorderStroke(1.dp, gold.copy(alpha = .16f))
                    ) {
                        BoxWithConstraints(Modifier.padding(horizontal = 18.dp, vertical = 18.dp)) {
                            val fontScale = LocalDensity.current.fontScale
                            val stacked = maxWidth < 225.dp || fontScale > 1.3f
                            val amount = "+$credits"
                            val amountSize = minOf(48f, (maxWidth.value - if (stacked) 0 else 86) / (amount.length * .66f * fontScale)).coerceAtLeast(18f).sp
                            val coin: @Composable () -> Unit = {
                                Box(Modifier.size(72.dp).background(Brush.radialGradient(listOf(gold.copy(alpha = .22f), Color.Transparent))), contentAlignment = Alignment.Center) {
                                    Image(painterResource(R.drawable.glossygoldcoin), contentDescription = null, modifier = Modifier.size(62.dp))
                                }
                            }
                            val amountLabel: @Composable () -> Unit = {
                                Text(amount, color = Primary, fontSize = amountSize, lineHeight = amountSize * 1.12f,
                                    fontWeight = FontWeight.SemiBold, letterSpacing = (-1).sp, maxLines = 1)
                                Text(if (credits == 1) "FREE CREDIT" else "FREE CREDITS", color = colors.onSurfaceVariant,
                                    fontSize = 10.sp, letterSpacing = 1.6.sp, fontWeight = FontWeight.Medium)
                            }
                            if (stacked) Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                                coin(); Spacer(Modifier.height(6.dp)); amountLabel()
                            } else Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                                coin(); Spacer(Modifier.width(14.dp))
                                Column(horizontalAlignment = Alignment.Start) { amountLabel() }
                            }
                        }
                    }
                    state.error?.let {
                        Spacer(Modifier.height(14.dp))
                        Text(it, color = colors.error, fontSize = 12.sp, lineHeight = 17.sp, textAlign = TextAlign.Center)
                    }
                    Spacer(Modifier.height(22.dp))
                    Button(
                        onClick = claim, enabled = enabled, shape = CircleShape,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp).clip(CircleShape)
                            .background(Brush.horizontalGradient(listOf(MaddsPalette.goldSoft.copy(alpha = if (enabled) 1f else .45f), gold.copy(alpha = if (enabled) 1f else .45f)))),
                        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = MaddsPalette.goldOn,
                            disabledContainerColor = Color.Transparent, disabledContentColor = MaddsPalette.goldOn.copy(alpha = .75f)),
                        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 14.dp)
                    ) {
                        if (state.claiming || state.loading) {
                            CircularProgressIndicator(Modifier.size(18.dp), color = MaddsPalette.goldOn, strokeWidth = 2.dp)
                            Spacer(Modifier.width(10.dp))
                            Text(if (state.claiming) "Claiming…" else "Checking…", fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        } else {
                            Text("Claim daily bonus", fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, null, modifier = Modifier.size(18.dp))
                        }
                    }
                    if (mayShowAd) {
                        Spacer(Modifier.height(8.dp))
                        Text("An ad may appear after your bonus is claimed.", color = colors.onSurfaceVariant,
                            fontSize = 10.sp, lineHeight = 15.sp, textAlign = TextAlign.Center)
                    }
                    TextButton(onClick = dismiss, enabled = !state.claiming, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) {
                        Text("Maybe later", color = colors.onSurfaceVariant.copy(alpha = if (state.claiming) .5f else 1f), fontSize = 12.sp)
                    }
                }
            }
        }
    }
}
