package com.itsdhruvbhardwaj.picme.ui.screens.settings

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.DeleteForever
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.LockReset
import androidx.compose.material.icons.filled.Password
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.itsdhruvbhardwaj.picme.BuildConfig
import com.itsdhruvbhardwaj.picme.R
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.auth.PasswordResetEmailState
import com.itsdhruvbhardwaj.picme.ui.components.PicMeCompactHeader
import com.itsdhruvbhardwaj.picme.ui.theme.Primary
import com.itsdhruvbhardwaj.picme.ui.theme.TextSecondary
import com.itsdhruvbhardwaj.picme.utils.SupportLinks
import androidx.compose.material.icons.filled.PrivacyTip
import androidx.compose.material.icons.filled.Description

@Composable
fun SettingsScreen(
    authViewModel: AuthViewModel,
    onBackClick: () -> Unit,
    onDeleteAccountClick: () -> Unit,
    onCreatePasswordClick: () -> Unit,
    onNotificationsClick: () -> Unit = {}
) {
    val authState by authViewModel.authState.collectAsState()
    val user = (authState as? AuthState.Authenticated)?.user
    val context = LocalContext.current
    val resetState by authViewModel.passwordResetEmailState.collectAsState()
    var passwordRequiredFor by remember { mutableStateOf<String?>(null) }
    var confirmReset by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { authViewModel.checkSession() }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {

        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                PicMeCompactHeader(
                    title = "Settings",
                    onBackClick = onBackClick
                )
            }
        ) { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 24.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionTitle("Account")
                    GlassCard {
                        SettingsRow(
                            icon = Icons.Default.Person,
                            title = user?.name?.takeIf(String::isNotBlank) ?: "madds account",
                            subtitle = user?.email.orEmpty(),
                            onClick = null
                        )
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionTitle("Preferences")
                    GlassCard {
                        SettingsRow(
                            icon = Icons.Default.Notifications,
                            title = "Notifications",
                            subtitle = "Manage madds notifications",
                            onClick = onNotificationsClick
                        )
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionTitle("Security")
                    GlassCard {
                      Column {
                        if (user?.hasGoogleLogin == true && !user.hasPassword) {
                            SettingsRow(
                                icon = Icons.Default.Password,
                                title = "Create password",
                                subtitle = "Add a password to your Google-linked account",
                                onClick = onCreatePasswordClick
                            )
                            HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                        }
                        SettingsRow(
                            icon = Icons.Default.LockReset,
                            title = "Reset password",
                            subtitle = if (resetState is PasswordResetEmailState.Sending) "Sending reset email…" else "Send a reset link to your email",
                            onClick = if (user == null || resetState is PasswordResetEmailState.Sending) null else {
                                { if (user.hasPassword) confirmReset = true else passwordRequiredFor = "reset your password" }
                            }
                        )
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                        SettingsRow(
                            icon = Icons.Default.DeleteForever,
                            title = "Delete Account",
                            subtitle = "Permanently remove your data",
                            onClick = if (user == null) null else {
                                { if (user.hasPassword) onDeleteAccountClick() else passwordRequiredFor = "delete your account" }
                            },
                            iconColor = Color(0xFFDC2626)
                        )
                      }
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    SectionTitle("About")
                    GlassCard {
                      Column {
                        SettingsRow(Icons.Default.Info, "About Madds", "Our story and creative vision", { SupportLinks.website(context, "about") })
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                        SettingsRow(Icons.Default.PrivacyTip, "Privacy Policy", "How your information is handled", { SupportLinks.website(context, "privacy") })
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                        SettingsRow(Icons.Default.Description, "Terms of Service", "Using Madds and its services", { SupportLinks.website(context, "terms") })
                      }
                    }
                    Text("Madds · Version ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})", style = MaterialTheme.typography.bodySmall, color = TextSecondary, modifier = Modifier.padding(12.dp))
                }
            }
        }
    }

    val requiredAction = passwordRequiredFor ?: if (resetState is PasswordResetEmailState.PasswordRequired) "reset your password" else null
    if (requiredAction != null) {
        AlertDialog(
            onDismissRequest = { passwordRequiredFor = null; authViewModel.clearSettingsPasswordResetState() },
            title = { Text("Create a password first") },
            text = { Text("To $requiredAction, first create and verify a password in Settings.") },
            confirmButton = {
                TextButton(onClick = {
                    passwordRequiredFor = null
                    authViewModel.clearSettingsPasswordResetState()
                    if (user?.hasGoogleLogin == true) onCreatePasswordClick()
                }) { Text(if (user?.hasGoogleLogin == true) "Create password" else "OK") }
            },
            dismissButton = { TextButton(onClick = { passwordRequiredFor = null; authViewModel.clearSettingsPasswordResetState() }) { Text("Cancel") } }
        )
    }
    if (confirmReset) {
        AlertDialog(onDismissRequest = { confirmReset = false },
            title = { Text("Reset password?") },
            text = { Text("Send a password reset link to ${user?.email.orEmpty()}? After changing your password, you'll need to sign in again.") },
            confirmButton = { TextButton(onClick = { confirmReset = false; authViewModel.requestSettingsPasswordReset() }) { Text("Send reset link") } },
            dismissButton = { TextButton(onClick = { confirmReset = false }) { Text("Cancel") } })
    }
    if (resetState is PasswordResetEmailState.Sent || resetState is PasswordResetEmailState.Error) {
        AlertDialog(onDismissRequest = { authViewModel.clearSettingsPasswordResetState() },
            title = { Text(if (resetState is PasswordResetEmailState.Sent) "Check your email" else "Couldn't send reset email") },
            text = { Text(when (val state = resetState) {
                is PasswordResetEmailState.Sent -> state.message
                is PasswordResetEmailState.Error -> state.message
                else -> ""
            }) },
            confirmButton = { TextButton(onClick = { authViewModel.clearSettingsPasswordResetState() }) { Text("OK") } })
    }
}

@Composable
private fun SectionTitle(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 6.dp)
    )
}

@Composable
private fun GlassCard(content: @Composable () -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(
                elevation = 4.dp,
                shape = shape,
                ambientColor = Color.Black.copy(alpha = 0.05f),
                spotColor = Color.Black.copy(alpha = 0.1f)
            )
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .background(MaterialTheme.colorScheme.surface, shape)
            .border(BorderStroke(1.dp, MaterialTheme.colorScheme.outline), shape)
            .clip(shape)
    ) {
        content()
    }
}

@Composable
private fun SettingsRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    onClick: (() -> Unit)?,
    iconColor: Color? = null
) {
    val resolvedIconColor = iconColor ?: MaterialTheme.colorScheme.primary
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier)
            .padding(horizontal = 16.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Box(
            modifier = Modifier.size(42.dp).clip(CircleShape).background(resolvedIconColor.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = resolvedIconColor, modifier = Modifier.size(21.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                color = iconColor ?: MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
        }
        if (onClick != null) {
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = TextSecondary
            )
        }
    }
}
