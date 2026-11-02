package com.itsdhruvbhardwaj.picme.utils

import java.security.MessageDigest

/** Shared with the backend; never pass email addresses to Google Play. */
fun billingAccountId(userId: String): String = MessageDigest.getInstance("SHA-256")
    .digest("madds:$userId".toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
