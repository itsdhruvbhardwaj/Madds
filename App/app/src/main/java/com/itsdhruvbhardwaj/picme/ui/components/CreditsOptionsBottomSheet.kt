package com.itsdhruvbhardwaj.picme.ui.components

import android.app.Activity
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import com.itsdhruvbhardwaj.picme.utils.BillingManager
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.theme.Primary
import com.itsdhruvbhardwaj.picme.ui.theme.Secondary
import com.itsdhruvbhardwaj.picme.ui.theme.TextSecondary
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreditsOptionsBottomSheet(
    viewModel: AuthViewModel,
    onDismiss: () -> Unit,
    sheetState: SheetState = rememberModalBottomSheetState()
) {
    val context = LocalContext.current
    val isAdLoading by viewModel.isRewardedAdLoading.collectAsState()
    val isPurchaseLoading by viewModel.isPurchaseLoading.collectAsState()
    val products by viewModel.creditProducts.collectAsState()
    var selectedProductId by remember { mutableStateOf(BillingManager.CREDIT_PRODUCT_ID) }
    val productDetails = products[selectedProductId]
    val priceLoading by viewModel.creditProductLoading.collectAsState()
    val priceError by viewModel.creditProductError.collectAsState()

    // Get the formatted price from Google Play ProductDetails
    val selectedOffer = productDetails?.let { com.itsdhruvbhardwaj.picme.utils.BillingManager.creditOffer(it) }
    val priceText = selectedOffer?.formattedPrice?.takeIf { it.isNotBlank() }
    LaunchedEffect(viewModel) { viewModel.refreshCreditProduct() }

    // Collect transient UI events like "Ad not ready" or "Purchase success"
    LaunchedEffect(viewModel) {
        viewModel.uiEvent.collectLatest { message ->
            Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
            // Auto-dismiss on success message from backend
            if (message.contains("Credits added", ignoreCase = true)) {
                onDismiss()
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp),
        dragHandle = { BottomSheetDefaults.DragHandle() }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Get More Credits",
                style = MaterialTheme.typography.headlineSmall.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 24.sp
                )
            )

            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = "Top up your balance to keep creating.",
                style = MaterialTheme.typography.bodyLarge,
                color = TextSecondary,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Watch Ad Button
            Button(
                onClick = {
                    val activity = context as? Activity
                    if (activity != null) {
                        viewModel.startRewardedAdFlow(activity)
                    }
                },
                enabled = !isAdLoading && !isPurchaseLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFF3F4F6),
                    contentColor = Color.Black
                ),
                contentPadding = PaddingValues(horizontal = 20.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxSize(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (isAdLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            color = MaterialTheme.colorScheme.primary,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.PlayCircle,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(16.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (isAdLoading) "Preparing Ad..." else "Watch an Ad to Earn",
                            style = MaterialTheme.typography.labelLarge.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                        )
                        Text(
                            text = "1 Ad = 1 Credit",
                            style = MaterialTheme.typography.labelSmall,
                            color = TextSecondary
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BillingManager.creditPacks.forEach { (id, credits) ->
                    val offer = products[id]?.let { BillingManager.creditOffer(it) }
                    val isSelected = selectedProductId == id
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .height(76.dp)
                            .border(
                                width = if (isSelected) 2.dp else 1.dp,
                                color = if (isSelected) Primary else MaterialTheme.colorScheme.outline.copy(alpha = 0.55f),
                                shape = RoundedCornerShape(12.dp)
                            )
                            .clickable(enabled = !isPurchaseLoading && !isAdLoading) {
                                selectedProductId = id
                            }
                            .background(
                                color = if (isSelected) Primary.copy(alpha = 0.16f)
                                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.28f),
                                shape = RoundedCornerShape(12.dp)
                            )
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        verticalArrangement = Arrangement.Center
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "$credits credits",
                                style = MaterialTheme.typography.labelLarge.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp,
                                    color = if (isSelected) Primary else MaterialTheme.colorScheme.onSurface
                                ),
                                maxLines = 1
                            )
                            if (isSelected) {
                                Spacer(modifier = Modifier.width(3.dp))
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = "Selected",
                                    tint = Primary,
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        }
                        Text(
                            text = offer?.formattedPrice ?: if (priceLoading) "Loading…" else "Price pending",
                            style = MaterialTheme.typography.labelSmall.copy(
                                color = if (isSelected) Primary else TextSecondary
                            ),
                            maxLines = 1
                        )
                        if (isSelected) {
                            Text(
                                text = "SELECTED",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    color = Primary,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 8.sp
                                )
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            Text(
                text = "Selected: ${BillingManager.creditPacks[selectedProductId]} credits${priceText?.let { " • $it" } ?: ""}",
                style = MaterialTheme.typography.labelMedium.copy(
                    color = Primary,
                    fontWeight = FontWeight.SemiBold
                )
            )
            Spacer(Modifier.height(12.dp))
            // Buy Credits Button (Premium Gradient)
            Button(
                onClick = {
                    if (selectedOffer == null || priceText == null || priceError != null) {
                        viewModel.refreshCreditProduct()
                    } else {
                        val activity = context as? Activity
                        if (activity != null) viewModel.startPurchaseFlow(activity, selectedProductId)
                    }
                },
                enabled = !isAdLoading && !isPurchaseLoading && !priceLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(64.dp),
                shape = RoundedCornerShape(16.dp),
                contentPadding = PaddingValues(0.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            brush = if (isPurchaseLoading) {
                                Brush.horizontalGradient(listOf(Color.Gray, Color.LightGray))
                            } else {
                                Brush.horizontalGradient(listOf(Primary, Secondary))
                            }
                        )
                        .padding(horizontal = 20.dp),
                    contentAlignment = Alignment.CenterStart
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (isPurchaseLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(24.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.ShoppingCart,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(16.dp))
                        Column {
                            Text(
                            text = when {
                                isPurchaseLoading -> "Processing..."
                                priceLoading -> "Loading price…"
                                priceText == null || priceError != null -> "Retry price"
                                else -> "Get ${BillingManager.creditPacks[selectedProductId]} Credits ($priceText)"
                            },
                                style = MaterialTheme.typography.labelLarge.copy(
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp
                                )
                            )
                            Text(
                                text = if (!priceLoading && (priceText == null || priceError != null)) "Couldn't load the price from Google Play" else "Secure purchase via Google Play",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White.copy(alpha = 0.8f)
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            TextButton(onClick = onDismiss, enabled = !isAdLoading && !isPurchaseLoading) {
                Text(
                    text = "Maybe Later",
                    style = MaterialTheme.typography.labelLarge.copy(
                        color = TextSecondary,
                        fontWeight = FontWeight.Medium
                    )
                )
            }
        }
    }
}
