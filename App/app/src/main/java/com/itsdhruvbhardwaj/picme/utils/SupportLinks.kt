package com.itsdhruvbhardwaj.picme.utils

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.browser.customtabs.CustomTabsIntent

object SupportLinks {
    const val WEBSITE = "https://maddsofficial.com"
    private const val INSTAGRAM = "https://www.instagram.com/madds.app/"

    fun instagram(context: Context) {
        val uri = Uri.parse(INSTAGRAM)
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri).setPackage("com.instagram.android")) }
            .onFailure {
                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                    .onFailure { Toast.makeText(context, "Couldn't open Instagram. Please visit @madds.app.", Toast.LENGTH_LONG).show() }
            }
    }

    fun shareApp(context: Context) {
        val share = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Try Madds")
            putExtra(Intent.EXTRA_TEXT, "Create your own AI photos with Madds!\nhttps://play.google.com/store/apps/details?id=${context.packageName}")
        }
        runCatching { context.startActivity(Intent.createChooser(share, "Share Madds")) }
            .onFailure { Toast.makeText(context, "Couldn't open sharing. Please try again.", Toast.LENGTH_SHORT).show() }
    }
    fun website(context: Context, page: String) {
        val uri = Uri.parse("$WEBSITE/$page.html")
        runCatching { CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, uri) }
            .onFailure { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }.onFailure { Toast.makeText(context, "Please visit $WEBSITE in your browser.", Toast.LENGTH_LONG).show() } }
    }
    fun openRating(context: Context): Boolean {
        val packageName = context.packageName
        return runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName")).setPackage("com.android.vending")) }.isSuccess ||
            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$packageName"))) }.isSuccess
    }
    fun rate(context: Context) {
        if (!openRating(context)) Toast.makeText(context, "Couldn't open Google Play. Please try again.", Toast.LENGTH_LONG).show()
    }
}
