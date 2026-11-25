package com.itsdhruvbhardwaj.picme.data.model

/** Warm only neighbouring looks; keep original URLs so every request shares Coil's cache. */
fun Style.adjacentPreviewUrls(): List<String> {
    val variants = group?.variants.orEmpty()
    val selected = variants.indexOfFirst { it.id == id }
    if (selected < 0) return emptyList()
    return listOf(selected + 1, selected - 1).mapNotNull { variants.getOrNull(it) }
        .flatMap { variant -> variant.comparisonPreview()?.let { listOf(it.second, it.first) } ?: listOfNotNull(variant.thumbnail) }
        .filter { it.isNotBlank() }.distinct()
}
