package com.itsdhruvbhardwaj.picme.ui.screens.auth

import androidx.compose.foundation.clickable
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.painterResource
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.components.PendingDeletionDialog
import com.itsdhruvbhardwaj.picme.ui.components.PicMeButton
import com.itsdhruvbhardwaj.picme.ui.components.PicMeSocialButton
import com.itsdhruvbhardwaj.picme.ui.components.PicMeTextField
import com.itsdhruvbhardwaj.picme.ui.theme.Primary
import com.itsdhruvbhardwaj.picme.ui.theme.TextSecondary

@Composable
fun LoginScreen(
    authState: AuthState,
    onLoginClick: (String, String) -> Unit,
    onResendVerificationClick: (String) -> Unit,
    onSignUpClick: () -> Unit,
    onGoogleClick: () -> Unit = {},
    onForgotPasswordClick: (String) -> Unit = {},
    onCancelDeletion: () -> Unit = {},
    onKeepDeletion: () -> Unit = {},
    onDismissDeletionDialog: () -> Unit = {},
    isDeletionCancellationLoading: Boolean = false
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }

    val isLoading = authState is AuthState.Authenticating
    val errorMessage = (authState as? AuthState.Error)?.message
    val isUnverified = errorMessage?.contains("hasn't been verified yet", ignoreCase = true) == true
    val isInvalidCredentials = errorMessage?.contains("Incorrect email or password", ignoreCase = true) == true

    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Image(
            painter = painterResource(R.drawable.headername),
            contentDescription = "Madds",
            modifier = Modifier.width(136.dp).height(44.dp),
            contentScale = ContentScale.Fit
        )
        
        Text(
            text = "Sign in to continue",
            style = MaterialTheme.typography.bodyLarge,
            color = TextSecondary,
            modifier = Modifier.padding(top = 8.dp)
        )

        Spacer(modifier = Modifier.height(48.dp))

        PicMeSocialButton(
            text = "Continue with Google",
            iconRes = R.drawable.google_icon_logo_svgrepo_com,
            onClick = onGoogleClick,
            enabled = !isLoading
        )

        Spacer(modifier = Modifier.height(24.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            HorizontalDivider(modifier = Modifier.weight(1f), color = Color(0xFFE5E7EB))
            Text(
                text = "OR",
                modifier = Modifier.padding(horizontal = 16.dp),
                style = MaterialTheme.typography.labelSmall,
                color = TextSecondary
            )
            HorizontalDivider(modifier = Modifier.weight(1f), color = Color(0xFFE5E7EB))
        }

        Spacer(modifier = Modifier.height(24.dp))

        PicMeTextField(
            value = email,
            onValueChange = { email = it },
            label = "Email",
            leadingIcon = Icons.Default.Email,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            enabled = !isLoading
        )

        Spacer(modifier = Modifier.height(16.dp))

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

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 8.dp),
            contentAlignment = Alignment.CenterEnd
        ) {
            Text(
                text = "Forgot Password?",
                style = MaterialTheme.typography.labelLarge,
                color = Primary,
                modifier = Modifier.clickable(enabled = !isLoading) { 
                    onForgotPasswordClick(email)
                }
            )
        }

        if (errorMessage != null) {
            Text(
                text = errorMessage,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(top = 16.dp),
                textAlign = TextAlign.Center
            )
            
            if (isUnverified) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Resend Verification Email",
                    color = Primary,
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                    modifier = Modifier.clickable(enabled = !isLoading) { 
                        onResendVerificationClick(email)
                    }
                )
            }

            if (isInvalidCredentials) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    horizontalArrangement = Arrangement.Center,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "Forgot password? ",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary
                    )
                    Text(
                        text = "Reset it",
                        style = MaterialTheme.typography.bodySmall.copy(
                            color = Primary,
                            fontWeight = FontWeight.Bold
                        ),
                        modifier = Modifier.clickable(enabled = !isLoading) { 
                            onForgotPasswordClick(email)
                        }
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(32.dp))

        PicMeButton(
            text = "Sign In",
            onClick = { onLoginClick(email, password) },
            isLoading = isLoading,
            enabled = email.isNotBlank() && password.isNotBlank()
        )

        Spacer(modifier = Modifier.height(24.dp))

        Row(
            horizontalArrangement = Arrangement.Center,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(
                text = "Don't have an account? ",
                style = MaterialTheme.typography.bodyMedium,
                color = TextSecondary
            )
            Text(
                text = "Sign Up",
                style = MaterialTheme.typography.bodyMedium.copy(
                    color = Primary,
                    fontWeight = FontWeight.Bold
                ),
                modifier = Modifier.clickable(enabled = !isLoading, onClick = onSignUpClick)
            )
        }
    }

    // Deletion Pending Dialog
    if (authState is AuthState.DeletionPending) {
        PendingDeletionDialog(
            scheduledDate = authState.scheduledDate,
            isLoading = isDeletionCancellationLoading,
            onCancelDeletion = onCancelDeletion,
            onKeepDeletion = onKeepDeletion,
            onDismiss = onDismissDeletionDialog
        )
    }
}
