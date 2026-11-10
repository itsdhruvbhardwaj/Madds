package com.itsdhruvbhardwaj.picme.ui.components

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.itsdhruvbhardwaj.picme.utils.AdManager

/** Local debug builds only. Reports contain no account details or adapter credentials. */
@Composable fun InterstitialDiagnosticsDialog(onDismiss:()->Unit) {
    val context=LocalContext.current
    val snapshot by AdManager.interstitialDiagnostics.collectAsState()
    val report=remember(snapshot){AdManager.diagnosticReport()}
    DisposableEffect(Unit){
        AdManager.setDiagnosticOverlayVisible(true)
        onDispose{AdManager.setDiagnosticOverlayVisible(false)}
    }
    AlertDialog(onDismissRequest=onDismiss,title={Text("Ad diagnostics")},text={
        Column(Modifier.heightIn(max=420.dp).verticalScroll(rememberScrollState()),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text("Readiness: ${snapshot.readiness}",style=MaterialTheme.typography.titleSmall)
            TextButton(onClick={AdManager.loadInterstitial(context)}){Text("Check readiness")}
            Text("Checks respect retry delays and never show an ad.",style=MaterialTheme.typography.bodySmall)
            SelectionContainer{Text(report,fontFamily=FontFamily.Monospace,fontSize=11.sp)}
        }
    },confirmButton={TextButton(onClick=onDismiss){Text("Close")}},dismissButton={
        TextButton(onClick={
            (context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager)?.setPrimaryClip(ClipData.newPlainText("Madds ad diagnostics",report))
            Toast.makeText(context,"Diagnostics copied",Toast.LENGTH_SHORT).show()
        }){Text("Copy report")}
    })
}
