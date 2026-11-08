package com.itsdhruvbhardwaj.picme.ui.screens.profile

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.PicMeCompactHeader
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

@Composable
fun StylePreferenceSetupScreen(authViewModel: AuthViewModel, onSaved: (String, String) -> Unit) {
    val auth by authViewModel.authState.collectAsState()
    val user = (auth as? AuthState.Authenticated)?.user ?: return
    val scope = rememberCoroutineScope()
    var selected by rememberSaveable(user.id) { mutableStateOf("all") }
    var saving by remember(user.id) { mutableStateOf(false) }
    var error by remember(user.id) { mutableStateOf<String?>(null) }
    val gold = Color(0xFFE1C477)
    fun finish(preference: String) {
        if (saving) return
        saving = true
        error = null
        scope.launch {
            try {
                authViewModel.completeStylePreferenceSetup(preference).fold(
                    onSuccess = { onSaved(it.id, preference) },
                    onFailure = { error = "Couldn't save your preference. Check your connection and try again." }
                )
            } catch (cancelled: CancellationException) { throw cancelled }
            finally { saving = false }
        }
    }
    BackHandler { finish("all") }
    Scaffold(containerColor = MaterialTheme.colorScheme.background, topBar = {
        PicMeCompactHeader("Style preference", onBackClick = { finish("all") }, actions = {
            TextButton(enabled = !saving, onClick = { finish("all") }) { Text("Skip", color = gold) }
        })
    }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 24.dp)) {
            Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Spacer(Modifier.height(20.dp))
                Text("Make Madds yours", style = MaterialTheme.typography.headlineMedium)
                Text("Choose the styles you'd like to see. You can change this later using Filter.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(8.dp))
                Column(Modifier.selectableGroup(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    listOf("male" to "For males", "female" to "For females", "all" to "For everyone").forEach { (value, label) ->
                        val chosen = selected == value
                        Row(Modifier.fillMaxWidth()
                            .border(1.dp, if (chosen) gold else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(20.dp))
                            .background(if (chosen) gold.copy(alpha = .10f) else MaterialTheme.colorScheme.surface, RoundedCornerShape(20.dp))
                            .selectable(selected = chosen, enabled = !saving, role = Role.RadioButton, onClick = { selected = value; error = null })
                            .padding(horizontal = 20.dp, vertical = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(label, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                            RadioButton(selected = chosen, enabled = !saving, onClick = null, colors = RadioButtonDefaults.colors(selectedColor = gold))
                        }
                    }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
                Spacer(Modifier.height(12.dp))
            }
            Text(when(selected) {
                "male" -> "Male styles and styles suitable for everyone will be shown."
                "female" -> "Female styles and styles suitable for everyone will be shown."
                else -> "All styles will be shown, including male, female, and universal styles."
            }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 16.dp))
            Button(enabled = !saving, onClick = { finish(selected) }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                colors = ButtonDefaults.buttonColors(containerColor = gold, contentColor = Color.Black)) {
                Text(if (saving) "Saving…" else "Continue")
            }
            Spacer(Modifier.height(20.dp))
        }
    }
}
