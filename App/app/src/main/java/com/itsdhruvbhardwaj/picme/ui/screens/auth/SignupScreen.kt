package com.itsdhruvbhardwaj.picme.ui.screens.auth

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.components.PicMeButton
import com.itsdhruvbhardwaj.picme.ui.components.PicMeSocialButton
import com.itsdhruvbhardwaj.picme.ui.components.PicMeTextField
import com.itsdhruvbhardwaj.picme.ui.theme.Primary
import com.itsdhruvbhardwaj.picme.ui.theme.TextSecondary
import com.itsdhruvbhardwaj.picme.utils.ValidationUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignupScreen(
    authState: AuthState,
    onSignupClick: (String, String, String) -> Unit,
    onSignInClick: () -> Unit,
    onBackClick: () -> Unit,
    onGoogleClick: () -> Unit = {}
) {
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var confirmPasswordVisible by remember { mutableStateOf(false) }

    val isLoading = authState is AuthState.Authenticating

    // Determine the error message and whether it's an "Email Already Exists" case
    val (errorMessage, isEmailAlreadyExists) = when (authState) {
        is AuthState.EmailAlreadyExists ->
            "An account with this email already exists. Please sign in instead." to true
        is AuthState.Error ->
            authState.message to false
        else -> null to false
    }

    // Validation States
    val isEmailValid = remember(email) { ValidationUtils.isValidEmail(email) }
    val passwordRequirements = remember(password) { ValidationUtils.checkPasswordRequirements(password) }
    val isPasswordStrong = remember(password) { ValidationUtils.isStrongPassword(password) }
    val passwordsMatch = remember(password, confirmPassword) { password == confirmPassword }

    val isFormValid by remember(name, email, password, confirmPassword) {
        derivedStateOf {
            name.length >= 2 &&
            isEmailValid &&
            isPasswordStrong &&
            confirmPassword.isNotEmpty() &&
            passwordsMatch
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = onBackClick, enabled = !isLoading) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
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
            Text(
                text = "Create Account",
                style = MaterialTheme.typography.headlineLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 32.sp
                ),
                modifier = Modifier.fillMaxWidth()
            )

            Text(
                text = "Join madds and start creating amazing AI photos",
                style = MaterialTheme.typography.bodyLarge,
                color = TextSecondary,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp, bottom = 32.dp)
            )

            PicMeTextField(
                value = name,
                onValueChange = { name = it },
                label = "Full Name",
                leadingIcon = Icons.Default.Person,
                enabled = !isLoading
            )

            Spacer(modifier = Modifier.height(16.dp))

            PicMeTextField(
                value = email,
                onValueChange = { email = it },
                label = "Email Address",
                leadingIcon = Icons.Default.Email,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                enabled = !isLoading
            )

            if (email.isNotEmpty() && !isEmailValid) {
                Text(
                    text = "Enter a valid email address.",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp, start = 4.dp)
                )
            }

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

            // Password Requirements Checklist
            Column(
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp, start = 4.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                RequirementItem("At least 8 characters", passwordRequirements.hasMinLength)
                RequirementItem("At least one uppercase letter", passwordRequirements.hasUppercase)
                RequirementItem("At least one lowercase letter", passwordRequirements.hasLowercase)
                RequirementItem("At least one number", passwordRequirements.hasDigit)
            }

            Spacer(modifier = Modifier.height(16.dp))

            PicMeTextField(
                value = confirmPassword,
                onValueChange = { confirmPassword = it },
                label = "Confirm Password",
                leadingIcon = Icons.Default.Lock,
                visualTransformation = if (confirmPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                trailingIcon = {
                    val image = if (confirmPasswordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff
                    IconButton(onClick = { confirmPasswordVisible = !confirmPasswordVisible }, enabled = !isLoading) {
                        Icon(imageVector = image, contentDescription = null, tint = TextSecondary)
                    }
                },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                enabled = !isLoading
            )

            if (confirmPassword.isNotEmpty() && !passwordsMatch) {
                Text(
                    text = "Passwords do not match.",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp, start = 4.dp)
                )
            }

            if (errorMessage != null) {
                Column(
                    modifier = Modifier.padding(top = 16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = errorMessage,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        textAlign = TextAlign.Center
                    )

                    if (isEmailAlreadyExists) {
                        TextButton(onClick = onSignInClick) {
                            Text(
                                text = "Sign In Now",
                                color = Primary,
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            PicMeButton(
                text = "Sign Up",
                onClick = {
                    if (isFormValid) {
                        onSignupClick(name, email, password)
                    }
                },
                isLoading = isLoading,
                enabled = isFormValid
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

            PicMeSocialButton(
                text = "Continue with Google",
                iconRes = R.drawable.google_icon_logo_svgrepo_com,
                onClick = onGoogleClick,
                enabled = !isLoading
            )

            Spacer(modifier = Modifier.weight(1f))

            Row(
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 24.dp)
            ) {
                Text(
                    text = "Already have an account? ",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary
                )
                Text(
                    text = "Sign In",
                    style = MaterialTheme.typography.bodyMedium.copy(
                        color = Primary,
                        fontWeight = FontWeight.Bold
                    ),
                    modifier = Modifier.clickable(enabled = !isLoading, onClick = onSignInClick)
                )
            }
        }
    }
}

@Composable
fun RequirementItem(text: String, isMet: Boolean) {
    val color by animateColorAsState(if (isMet) Primary else TextSecondary.copy(alpha = 0.5f), label = "color")
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth()
    ) {
        Icon(
            imageVector = if (isMet) Icons.Default.Check else Icons.Default.Close,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = color
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = color
        )
    }
}
