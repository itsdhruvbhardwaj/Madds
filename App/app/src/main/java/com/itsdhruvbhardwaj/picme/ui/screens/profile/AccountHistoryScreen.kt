package com.itsdhruvbhardwaj.picme.ui.screens.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.itsdhruvbhardwaj.picme.data.model.CreditHistoryItem
import com.itsdhruvbhardwaj.picme.data.model.PurchaseHistoryItem
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.PicMeMainHeader
import com.itsdhruvbhardwaj.picme.ui.theme.TextSecondary
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun AccountHistoryScreen(authViewModel: AuthViewModel, purchases: Boolean, onBack: () -> Unit) {
    var purchaseItems by remember { mutableStateOf<List<PurchaseHistoryItem>?>(null) }
    var creditItems by remember { mutableStateOf<List<CreditHistoryItem>?>(null) }
    var error by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    var page by remember(purchases) { mutableIntStateOf(1) }
    var hasMore by remember(purchases) { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    val scroll = rememberScrollState()
    LaunchedEffect(purchases, page, reload) {
        error = false; loading = true; hasMore = false
        purchaseItems = null; creditItems = null
        scroll.scrollTo(0)
        if (purchases) authViewModel.getPurchases(page).onSuccess { purchaseItems = it.purchases; hasMore = it.hasMore }.onFailure { error = true }
        else authViewModel.getCreditHistory(page).onSuccess { creditItems = it.transactions; hasMore = it.hasMore }.onFailure { error = true }
        loading = false
    }
    val title = if (purchases) "My Purchases" else "Credit History"
    Scaffold(containerColor = Color.Transparent, topBar = {
        PicMeMainHeader(title = title, authState = authViewModel.authState.collectAsState().value, onProfileClick = onBack,
            actions = { TextButton(onClick = onBack) { Text("Back") } })
    }) { padding ->
        Column(Modifier.fillMaxSize().padding(top = padding.calculateTopPadding()).verticalScroll(scroll).padding(horizontal = 24.dp).padding(bottom = 120.dp)) {
            Spacer(Modifier.height(6.dp))
            when {
                error -> Column(Modifier.align(Alignment.CenterHorizontally).padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Could not load history. Please try again.", color = TextSecondary)
                    TextButton(onClick = { reload++; purchaseItems = null; creditItems = null }) { Text("Retry") }
                }
                loading || purchases && purchaseItems == null || !purchases && creditItems == null -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally).padding(32.dp))
                purchases && purchaseItems!!.isEmpty() || !purchases && creditItems!!.isEmpty() -> Text(if (page > 1) "No more records on this page." else if (purchases) "Your purchases will appear here." else "Your credit activity will appear here.", color = TextSecondary, modifier = Modifier.align(Alignment.CenterHorizontally).padding(32.dp))
                purchases -> purchaseItems!!.forEach { item -> HistoryRow(
                    title = item.displayName?.takeIf { it.isNotBlank() } ?: if (item.creditsGranted > 0) "${item.creditsGranted} credits" else "Credit pack",
                    detail = if (item.quantity > 1) "${item.quantity} packs" else "Google Play purchase",
                    status = when (item.status) { "verified" -> "Purchased"; "refunded" -> "Refunded"; "cancelled" -> "Cancelled"; "failed" -> "Failed"; else -> "Pending" },
                    amount = if (item.amount > 0) "${item.currency} ${"%.2f".format(Locale.US, item.amount)}" else null,
                    date = item.purchaseTime ?: item.verifiedAt ?: item.createdAt
                ) }
                else -> creditItems!!.forEach { item -> HistoryRow(
                    title = item.displayName?.takeIf { it.isNotBlank() } ?: when (item.type) {
                        "GENERATION" -> "Image generation"
                        "REWARDED_AD" -> "Rewarded ad"
                        "PURCHASE" -> "${kotlin.math.abs(item.amount)} credit purchase"
                        "REFUND" -> "Generation refund"
                        "INITIAL_GRANT" -> "Welcome credits"
                        else -> "Credit adjustment"
                    },
                    detail = "Balance: ${item.balanceAfter}",
                    status = if (item.amount >= 0) "Added" else "Spent",
                    amount = "${if (item.amount >= 0) "+" else ""}${item.amount} credits",
                    date = item.createdAt
                ) }
            }
            if (page > 1 || hasMore) {
                Row(Modifier.fillMaxWidth().padding(top = 16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    TextButton(onClick = { loading = true; page-- }, enabled = !loading && page > 1) { Text("Previous") }
                    Text("Page $page", style = MaterialTheme.typography.labelMedium, color = TextSecondary)
                    TextButton(onClick = { loading = true; page++ }, enabled = !loading && !error && hasMore) { Text("Next") }
                }
            }
        }
    }
}

@Composable
private fun HistoryRow(title: String, detail: String, status: String, amount: String?, date: String?) {
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium))
                Spacer(Modifier.height(3.dp))
                Text(detail, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                Text("${date?.let(::formatDate) ?: "Date unavailable"} · $status", style = MaterialTheme.typography.labelSmall, color = TextSecondary)
            }
            if (amount != null) {
                Spacer(Modifier.width(16.dp))
                Text(amount, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold), color = MaterialTheme.colorScheme.onSurface)
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f), thickness = 0.5.dp)
    }
}

private fun formatDate(value: String): String = try {
    val parsed = value.toLongOrNull()?.let(::Date) ?: SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).parse(value.substringBefore('.').removeSuffix("Z"))
    parsed?.let { SimpleDateFormat("dd MMM yyyy", Locale.getDefault()).format(it) } ?: value.take(10)
} catch (_: Exception) { value.take(10) }
