package com.itsdhruvbhardwaj.picme.ui.screens.settings

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CardGiftcard
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.NewReleases
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.itsdhruvbhardwaj.picme.notifications.*
import com.itsdhruvbhardwaj.picme.ui.components.PicMeCompactHeader

@Composable
fun NotificationSettingsScreen(userId: String?, viewModel: NotificationPreferencesViewModel, onBack: () -> Unit) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val state by viewModel.state.collectAsState()
    var permission by remember { mutableStateOf(PushNotifications.permissionGranted(context)) }
    var channelRevision by remember { mutableIntStateOf(0) }
    val prefs = remember { context.getSharedPreferences("madds_push_installation", Context.MODE_PRIVATE) }
    val requestPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        permission = PushNotifications.permissionGranted(context); channelRevision++
        if (granted) PushPermissionGrant.onAllowed(context) else PushSyncWorker.enqueue(context)
        userId?.let(viewModel::load)
    }
    fun openDeviceSettings(category: PushCategory? = null) {
        val intent = if (category != null && Build.VERSION.SDK_INT >= 26) Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
            putExtra(Settings.EXTRA_CHANNEL_ID, category.channelId); putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        } else if (Build.VERSION.SDK_INT >= 26) Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply { putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName) }
        else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:${context.packageName}"))
        runCatching { context.startActivity(intent) }.onFailure {
            context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:${context.packageName}")))
        }
    }
    fun enableDeviceNotifications() {
        val activity = context as? Activity
        if (Build.VERSION.SDK_INT >= 33 && !permission &&
            (!prefs.getBoolean("permission_requested", false) || activity?.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) == true)) {
            prefs.edit().putBoolean("permission_requested", true).apply()
            requestPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else openDeviceSettings()
    }
    fun openServiceChannel(channelId: String) {
        GenerationNotifications.createChannels(context)
        if (Build.VERSION.SDK_INT >= 26) runCatching {
            context.startActivity(Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_CHANNEL_ID, channelId); putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
            })
        }.onFailure { openDeviceSettings() } else openDeviceSettings()
    }
    LaunchedEffect(userId) { userId?.let(viewModel::load) }
    DisposableEffect(lifecycle, context, userId) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) {
            val updated = PushNotifications.permissionGranted(context)
            if (updated != permission) PushSyncWorker.enqueue(context)
            permission = updated; channelRevision++
            userId?.let(viewModel::load)
        } }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { lifecycle.lifecycle.removeObserver(observer) }
    }
    Scaffold(topBar = { PicMeCompactHeader(title = "Notifications", onBackClick = onBack) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (userId == null) { Text("Sign in to manage your notifications."); return@Column }
            Card(shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primary.copy(alpha = .08f)),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = .3f))) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Outlined.NotificationsActive, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(26.dp))
                    Text(if (permission) "Notifications are on" else "Notifications are off", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(if (permission) "Choose what reaches you. You can change your mind anytime." else "Allow notifications on this device, then choose the updates you'd like.",
                        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    TextButton(onClick = { enableDeviceNotifications() }, contentPadding = PaddingValues(0.dp)) {
                        Text(if (permission) "Manage device settings" else "Enable notifications")
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            Text("Your photos", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text("Manage photo alerts for this phone.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedCard(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.outlinedCardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                PhotoNotificationSetting(Icons.Outlined.NotificationsActive, "Photo ready", "Alerts when your photo is ready") {
                    openServiceChannel(GenerationNotifications.READY)
                }
                HorizontalDivider(Modifier.padding(start = 62.dp, end = 16.dp))
                PhotoNotificationSetting(Icons.Outlined.AutoAwesome, "Generation progress", "Quiet updates while creating") {
                    openServiceChannel(GenerationNotifications.PROGRESS)
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Updates & offers", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Box(Modifier.size(18.dp), contentAlignment = Alignment.Center) {
                    if (state.loading) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                }
            }
            Text("Choose what you'd like to hear about. These choices sync with your account.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            PushCategory.entries.forEach { category ->
                val checked = state.userId == userId && state.preferences[category.key] == true
                val saving = state.userId == userId && category.key in state.savingCategories
                val channelAllowed = remember(channelRevision, category) { PushNotifications.channelAllowed(context, category) }
                val headsUp = remember(channelRevision, category) { PushNotifications.headsUpEnabled(context, category) }
                val icon = when (category) {
                    PushCategory.NEW_STYLES -> Icons.Outlined.AutoAwesome
                    PushCategory.OFFERS -> Icons.Outlined.CardGiftcard
                    PushCategory.UPDATES -> Icons.Outlined.NewReleases
                    PushCategory.REENGAGEMENT -> Icons.Outlined.Notifications
                }
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(38.dp).background(MaterialTheme.colorScheme.primary.copy(alpha = .1f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(21.dp))
                            }
                            Column(Modifier.weight(1f)) {
                                Text(category.label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                                Spacer(Modifier.height(5.dp))
                                Text(category.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                if (permission && channelAllowed) TextButton(onClick = { openDeviceSettings(category) }, contentPadding = PaddingValues(0.dp)) {
                                    Text(if (headsUp) "Sound & vibration" else "Enable pop-up & vibration")
                                }
                            }
                            Column(Modifier.width(52.dp).height(64.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                Switch(checked = checked, enabled = state.userId == userId && !state.loading && !saving,
                                    colors = SwitchDefaults.colors(
                                        uncheckedThumbColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                        uncheckedTrackColor = MaterialTheme.colorScheme.surfaceVariant,
                                        uncheckedBorderColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .45f),
                                        disabledCheckedTrackColor = MaterialTheme.colorScheme.primary,
                                        disabledCheckedThumbColor = MaterialTheme.colorScheme.onPrimary,
                                        disabledUncheckedTrackColor = MaterialTheme.colorScheme.surfaceVariant,
                                        disabledUncheckedThumbColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                        disabledUncheckedBorderColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = .45f)),
                                    onCheckedChange = { value -> viewModel.set(userId, category, value); if (value && !permission) enableDeviceNotifications() })
                                Box(Modifier.height(16.dp), contentAlignment = Alignment.Center) {
                                    if (saving) CircularProgressIndicator(Modifier.size(12.dp), strokeWidth = 1.5.dp)
                                }
                            }
                        }
                        if (checked && permission && !channelAllowed) TextButton(onClick = { openDeviceSettings(category) }) { Text("Muted in device settings") }
                    }
                }
            }
            if (state.userId == userId && state.error != null) {
                Text(state.error.orEmpty(), color = MaterialTheme.colorScheme.error)
                TextButton(onClick = { viewModel.load(userId) }, enabled = !state.loading && !state.saving) { Text("Retry sync") }
            }
            Text("Turning a category off stops it on this device immediately. Changes sync to your other devices when connected.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PhotoNotificationSetting(icon: ImageVector, title: String, description: String, onClick: () -> Unit) {
    Surface(onClick = onClick, color = MaterialTheme.colorScheme.surface) {
        Row(Modifier.fillMaxWidth().heightIn(min = 76.dp).padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(26.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Outlined.ChevronRight, contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        }
    }
}
