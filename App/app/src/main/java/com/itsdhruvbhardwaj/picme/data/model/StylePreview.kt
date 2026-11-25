package com.itsdhruvbhardwaj.picme.data.model

/** Legacy preview lists are not proof that a before/after pair was assigned. */
fun Style.comparisonPreview(): Pair<String, String>? {
    val before = exampleBeforeUrl?.trim()?.takeIf(String::isNotEmpty) ?: return null
    val after = exampleAfterUrl?.trim()?.takeIf(String::isNotEmpty) ?: return null
    return before to after
}
