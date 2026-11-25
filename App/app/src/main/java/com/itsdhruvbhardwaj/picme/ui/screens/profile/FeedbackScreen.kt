package com.itsdhruvbhardwaj.picme.ui.screens.profile

import android.os.Build
import android.util.Patterns
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.itsdhruvbhardwaj.picme.BuildConfig
import com.itsdhruvbhardwaj.picme.data.model.FeedbackRequest
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.PicMeCompactHeader
import com.itsdhruvbhardwaj.picme.utils.SupportLinks
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import java.util.UUID

@Composable
fun FeedbackScreen(viewModel: AuthViewModel, onBack: () -> Unit) {
    var category by rememberSaveable { mutableStateOf("SUGGESTION") }
    var message by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var requestId by rememberSaveable { mutableStateOf(UUID.randomUUID().toString()) }
    var sending by remember { mutableStateOf(false) }
    var sent by rememberSaveable { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope(); val context = LocalContext.current
    fun changed() { requestId = UUID.randomUUID().toString(); error = null }
    Scaffold(topBar = { PicMeCompactHeader("Send Feedback", onBackClick = onBack) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Text("Help us make Madds better", style = MaterialTheme.typography.titleLarge)
            Text("Share a suggestion or tell us about a problem.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                mapOf("SUGGESTION" to "Suggestion", "BUG" to "Bug report", "OTHER" to "Other").forEach { (key, label) ->
                    FilterChip(selected = category == key, onClick = { category = key; changed() }, enabled = !sending && !sent, label = { Text(label) })
                }
            }
            OutlinedTextField(message, onValueChange = { if (it.length <= 2000) { message = it; changed() } }, label = { Text("Your feedback") },
                supportingText = { Text("${message.length} / 2,000 characters · minimum 10") }, enabled = !sending && !sent,
                minLines = 5, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(email, onValueChange = { if (it.length <= 254) { email = it; changed() } }, label = { Text("Contact email (optional)") },
                supportingText = { Text("Include an email if you'd like a reply.") }, singleLine = true, enabled = !sending && !sent, modifier = Modifier.fillMaxWidth())
            Text("Your account ID, app version and Android version are included to help us investigate. Do not include passwords, verification codes or payment-card details.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            if (sent) {
                Text("Thanks! Your feedback has been received.", color = MaterialTheme.colorScheme.primary)
                Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text("Done") }
            } else Button(onClick = {
                if (email.isNotBlank() && !Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches()) { error = "Enter a valid contact email or leave it empty." }
                else {
                    sending = true; error = null
                    scope.launch {
                        try {
                            val result = viewModel.sendFeedback(FeedbackRequest(requestId, category, message.trim(), email.trim(), BuildConfig.VERSION_NAME, Build.VERSION.RELEASE))
                            if (result.getOrNull() == true) sent = true else error = "Couldn't send feedback. Check your connection and try again."
                        } catch (cancelled: CancellationException) { throw cancelled }
                        finally { sending = false }
                    }
                }
            }, enabled = !sending && message.trim().length >= 10, modifier = Modifier.fillMaxWidth()) {
                if (sending) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Send feedback")
            }
            TextButton(onClick = { SupportLinks.website(context, "contact") }) { Text("Need account or purchase support?") }
        }
    }
}
