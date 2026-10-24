package com.itsdhruvbhardwaj.picme.ui.screens.settings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.auth.PasswordSetupState
import com.itsdhruvbhardwaj.picme.ui.components.PicMeButton
import com.itsdhruvbhardwaj.picme.ui.components.PicMeCompactHeader
import com.itsdhruvbhardwaj.picme.ui.components.PicMeTextField
import com.itsdhruvbhardwaj.picme.ui.theme.TextSecondary
import com.itsdhruvbhardwaj.picme.utils.ValidationUtils

@Composable
fun DeleteAccountScreen(
    authState: AuthState,
    passwordSetupState: PasswordSetupState,
    onBackClick: () -> Unit,
    hasPassword: Boolean,
    hasGoogleLogin: Boolean,
    onSubmitDelete: (String) -> Unit,
    onRequestPasswordSetup: (String, String) -> Unit,
    onRefreshPasswordSetup: () -> Unit
) {
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var confirmPasswordVisible by remember { mutableStateOf(false) }
    var showConfirmDialog by remember { mutableStateOf(false) }
    val isLoading = authState is AuthState.Authenticating
    val isSettingUpPassword = passwordSetupState is PasswordSetupState.Sending ||
        passwordSetupState is PasswordSetupState.Verifying
    val setupVerified = hasPassword || passwordSetupState is PasswordSetupState.Verified
    val needsPasswordSetup = hasGoogleLogin && !setupVerified
    val passwordStrong = ValidationUtils.isStrongPassword(password)
    val passwordsMatch = password.isNotEmpty() && password == confirmPassword

    Box(modifier = Modifier.fillMaxSize()) {
        Image(
            painter = painterResource(R.drawable.glassmorphismwallpaper),
            contentDescription = null,
            modifier = Modifier.fillMaxSize().blur(20.dp),
            contentScale = ContentScale.Crop
        )
        Box(modifier = Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.28f)))

        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                PicMeCompactHeader(
                    title = "Delete Account",
                    onBackClick = onBackClick
                )
            }
        ) { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(horizontal = 24.dp)
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Spacer(modifier = Modifier.height(24.dp))
                
                // Warning Icon Box
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFFFEBEE)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Warning,
                        contentDescription = null,
                        tint = Color(0xFFD32F2F),
                        modifier = Modifier.size(32.dp)
                    )
                }

                Spacer(modifier = Modifier.height(24.dp))

                Text(
                    text = "Account Deletion",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(16.dp))

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White.copy(alpha = 0.4f), RoundedCornerShape(24.dp))
                        .border(BorderStroke(1.dp, Color.White.copy(alpha = 0.5f)), RoundedCornerShape(24.dp))
                        .padding(20.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(
                            text = "Warning: This action is destructive.",
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFD32F2F)
                        )
                        Text(
                            text = "Once requested, your account will be scheduled for deletion. You will have a 30-day grace period to cancel this request by simply signing back into your account.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = TextSecondary
                        )
                        Text(
                            text = "After 30 days, your photos, style generations, and account data will be permanently removed.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = TextSecondary
                        )
                    }
                }

                Spacer(modifier = Modifier.height(32.dp))

                if (needsPasswordSetup) {
                    Text(
                        text = "Set a password for your Google account before requesting account deletion.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                        modifier = Modifier.fillMaxWidth().padding(start = 4.dp)
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    PicMeTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = "New password",
                        leadingIcon = Icons.Default.Lock,
                        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            val image = if (passwordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff
                            IconButton(onClick = { passwordVisible = !passwordVisible }, enabled = !isLoading) {
                                Icon(imageVector = image, contentDescription = null, tint = TextSecondary)
                            }
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        enabled = !isSettingUpPassword
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    PicMeTextField(
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it },
                        label = "Confirm new password",
                        leadingIcon = Icons.Default.Lock,
                        visualTransformation = if (confirmPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            val image = if (confirmPasswordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff
                            IconButton(onClick = { confirmPasswordVisible = !confirmPasswordVisible }, enabled = !isSettingUpPassword) {
                                Icon(imageVector = image, contentDescription = null, tint = TextSecondary)
                            }
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        enabled = !isSettingUpPassword
                    )
                    Text(
                        text = "Use at least 8 characters, including uppercase and lowercase letters and a number.",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                        modifier = Modifier.fillMaxWidth().padding(start = 4.dp, top = 4.dp)
                    )
                    when (val state = passwordSetupState) {
                        is PasswordSetupState.EmailSent -> {
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(state.message, color = TextSecondary, modifier = Modifier.fillMaxWidth())
                            Text(
                                "Open the verification link sent to your email, then return here.",
                                color = TextSecondary,
                                modifier = Modifier.fillMaxWidth().padding(top = 6.dp)
                            )
                            TextButton(onClick = onRefreshPasswordSetup, enabled = !isSettingUpPassword) {
                                Text("I verified my email")
                            }
                        }
                        is PasswordSetupState.Error -> {
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(state.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.fillMaxWidth())
                            if (password.isNotEmpty() && confirmPassword.isNotEmpty()) {
                                TextButton(onClick = onRefreshPasswordSetup, enabled = !isSettingUpPassword) {
                                    Text("Check verification status")
                                }
                            }
                        }
                        else -> Unit
                    }
                    Spacer(modifier = Modifier.height(32.dp))
                    PicMeButton(
                        text = if (passwordSetupState is PasswordSetupState.EmailSent) "Resend verification email" else "Send verification email",
                        onClick = { onRequestPasswordSetup(password, confirmPassword) },
                        enabled = passwordStrong && passwordsMatch && !isSettingUpPassword,
                        isLoading = isSettingUpPassword,
                        modifier = Modifier.fillMaxWidth()
                    )
                } else if (hasPassword || setupVerified) {
                    Text(
                        text = "Confirm your password to continue",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    PicMeTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = "Password",
                        leadingIcon = Icons.Default.Lock,
                        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        trailingIcon = {
                            val image = if (passwordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff
                            IconButton(onClick = { passwordVisible = !passwordVisible }, enabled = !isLoading) {
                                Icon(imageVector = image, contentDescription = null, tint = TextSecondary)
                            }
                        },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        enabled = !isLoading
                    )
                    Spacer(modifier = Modifier.height(32.dp))
                    PicMeButton(
                        text = "Request Account Deletion",
                        onClick = { showConfirmDialog = true },
                        enabled = password.isNotBlank() && !isLoading,
                        isLoading = isLoading,
                        modifier = Modifier.fillMaxWidth()
                    )
                } else {
                    Text(
                        text = "This account does not have a password. Sign in with Google, then set and verify a password here before requesting deletion.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextSecondary,
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Spacer(modifier = Modifier.height(32.dp))
                
                Spacer(modifier = Modifier.height(32.dp))
            }
        }
    }

    if (showConfirmDialog) {
        DeleteConfirmDialog(
            onConfirm = {
                showConfirmDialog = false
                onSubmitDelete(password)
            },
            onDismiss = { showConfirmDialog = false }
        )
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
