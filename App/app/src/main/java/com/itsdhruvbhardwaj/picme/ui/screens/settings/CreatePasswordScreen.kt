package com.itsdhruvbhardwaj.picme.ui.screens.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.itsdhruvbhardwaj.picme.data.model.User
import com.itsdhruvbhardwaj.picme.ui.auth.PasswordSetupState
import com.itsdhruvbhardwaj.picme.ui.components.PicMeCompactHeader
import com.itsdhruvbhardwaj.picme.ui.components.PicMeTextField
import com.itsdhruvbhardwaj.picme.utils.ValidationUtils

@Composable
fun CreatePasswordScreen(
    user: User?,
    state: PasswordSetupState,
    onBack: () -> Unit,
    onSend: (String, String) -> Unit,
    onRefresh: () -> Unit
) {
    var password by remember(user?.id) { mutableStateOf("") }
    var confirmation by remember(user?.id) { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var confirmationVisible by remember { mutableStateOf(false) }
    var emailRequested by remember { mutableStateOf(state is PasswordSetupState.EmailSent) }
    val busy = state is PasswordSetupState.Sending || state is PasswordSetupState.Verifying
    val complete = user?.hasPassword == true
    val latestState by rememberUpdatedState(state)
    val latestRefresh by rememberUpdatedState(onRefresh)
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle, user?.id) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && latestState is PasswordSetupState.EmailSent) latestRefresh()
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(state, complete) {
        if (state is PasswordSetupState.EmailSent) emailRequested = true
        if (complete) { password = ""; confirmation = "" }
    }
    Scaffold(topBar = { PicMeCompactHeader("Create password", onBackClick = onBack) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())
            .imePadding().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            when {
                complete -> {
                    Text("Your password is ready", style = MaterialTheme.typography.headlineSmall)
                    Text("You can sign in with your email and password or keep using Google sign-in.")
                    Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Back to Settings") }
                }
                user?.hasGoogleLogin != true -> {
                    Text("Password creation is available for Google-linked accounts without a password.")
                    TextButton(onClick = onBack) { Text("Back to Settings") }
                }
                else -> {
                    Text("Add a password to your account", style = MaterialTheme.typography.headlineSmall)
                    Text("We'll send a verification link to ${user.email}. Your password becomes active after you open that link. Google sign-in will continue to work.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                    PicMeTextField(value = password, onValueChange = { password = it }, label = "New password",
                        leadingIcon = Icons.Default.Lock, enabled = !busy,
                        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        trailingIcon = { IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility, "Show or hide password")
                        } })
                    PicMeTextField(value = confirmation, onValueChange = { confirmation = it }, label = "Confirm password",
                        leadingIcon = Icons.Default.Lock, enabled = !busy,
                        visualTransformation = if (confirmationVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        trailingIcon = { IconButton(onClick = { confirmationVisible = !confirmationVisible }) {
                            Icon(if (confirmationVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility, "Show or hide confirmation")
                        } })
                    Text("Use at least 8 characters with uppercase and lowercase letters and a number.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (state is PasswordSetupState.EmailSent) Text(state.message)
                    if (state is PasswordSetupState.Error) Text(state.message, color = MaterialTheme.colorScheme.error)
                    if (emailRequested) TextButton(onClick = onRefresh, enabled = !busy) { Text("I verified my email · Check status") }
                    Button(onClick = { onSend(password, confirmation) },
                        enabled = !busy && ValidationUtils.isStrongPassword(password) && password == confirmation,
                        modifier = Modifier.fillMaxWidth().height(52.dp)) {
                        if (busy) CircularProgressIndicator(Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                        else Text(if (emailRequested) "Resend verification email" else "Send verification email")
                    }
                }
            }
        }
    }
}
