package com.itsdhruvbhardwaj.picme.ui.screens.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.itsdhruvbhardwaj.picme.ui.components.PicMeCompactHeader
import com.itsdhruvbhardwaj.picme.ui.components.PicMeTextField

@Composable
fun DeleteAccountScreen(
    onBackClick: () -> Unit,
    hasPassword: Boolean,
    hasGoogleLogin: Boolean,
    isDeleting: Boolean,
    onSubmitDelete: (String) -> Unit,
    onCreatePassword: () -> Unit
) {
    var password by remember { mutableStateOf("") }
    var visible by remember { mutableStateOf(false) }
    var showConfirmDialog by remember { mutableStateOf(false) }
    Scaffold(topBar = { PicMeCompactHeader("Delete account", onBackClick = onBackClick) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).imePadding().padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Text("Account deletion", style = MaterialTheme.typography.headlineSmall)
            if (!hasPassword) {
                Text("To delete your account, first create and verify a password in Settings.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (hasGoogleLogin) Button(onClick = onCreatePassword, modifier = Modifier.fillMaxWidth()) { Text("Create password") }
                TextButton(onClick = onBackClick) { Text("Back to Settings") }
            } else {
                Text("Your account will be scheduled for deletion. You have 30 days to cancel by signing in again. After that, your photos, generations, and account data will be permanently removed.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Confirm your current password to continue.")
                PicMeTextField(value = password, onValueChange = { password = it }, label = "Current password",
                    leadingIcon = Icons.Default.Lock, enabled = !isDeleting,
                    visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    trailingIcon = { IconButton(onClick = { visible = !visible }, enabled = !isDeleting) {
                        Icon(if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility, "Show or hide password")
                    } })
                Button(onClick = { showConfirmDialog = true }, enabled = password.isNotBlank() && !isDeleting,
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError)) {
                    if (isDeleting) CircularProgressIndicator(Modifier.size(20.dp), color = MaterialTheme.colorScheme.onError, strokeWidth = 2.dp)
                    else Text("Request account deletion")
                }
            }
        }
    }
    if (showConfirmDialog && hasPassword && !isDeleting) {
        DeleteConfirmDialog(onConfirm = { showConfirmDialog = false; onSubmitDelete(password) },
            onDismiss = { showConfirmDialog = false })
    }
}
@Composable
fun DeleteConfirmDialog(
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
            shape = RoundedCornerShape(28.dp),
            color = Color.White,
            shadowElevation = 6.dp
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Delete Account?",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF1F2937)
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Are you sure you want to schedule your account for deletion? You can cancel this within 30 days.",
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center,
                    color = Color(0xFF4B5563)
                )
                Spacer(modifier = Modifier.height(32.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f).height(48.dp),
                        shape = CircleShape,
                        border = BorderStroke(1.dp, Color(0xFFE5E7EB)),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = Color(0xFF4B5563)
                        )
                    ) {
                        Text(
                            text = "Cancel",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Button(
                        onClick = onConfirm,
                        modifier = Modifier.weight(1f).height(48.dp),
                        shape = CircleShape,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFDC2626)
                        )
                    ) {
                        Text(
                            text = "Delete",
                            style = MaterialTheme.typography.labelLarge,
                            color = Color.White,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}
