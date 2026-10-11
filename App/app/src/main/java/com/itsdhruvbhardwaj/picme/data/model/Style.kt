package com.itsdhruvbhardwaj.picme.data.model

/**
 * Data model representing a generation style in PicMe.
 *
 * @property id Unique identifier for the style.
 * @property name Human-readable name of the style.
 * @property description Detailed description of what the style produces.
 * @property prompt The underlying AI prompt template for this style.
 * @property thumbnail URL to the small preview image.
 * @property previewImages List of URLs to full-size example images.
 * @property imageCount Number of input images required for this style.
 * @property tokensRequired Number of credits required to generate an image in this style.
 * @property category The functional category (e.g., Portrait, Artistic).
 * @property collections List of collection slugs this style belongs to.
 */
data class Style(
    val id: String = "",
    val name: String = "",
    val description: String = "",
    val prompt: String = "",
    val thumbnail: String? = null,
    val previewImages: List<String> = emptyList(),
    val imageCount: Int = 1,
    val tokensRequired: Int = 0,
    val category: String = "",
    val collections: List<String> = emptyList()
)

data class PaginationMetadata(
    val currentPage: Int = 1,
    val totalPages: Int = 1,
    val totalCount: Int = 0,
    val hasNextPage: Boolean = false
)

data class StyleResponse(
    val styles: List<Style> = emptyList(),
    val pagination: PaginationMetadata = PaginationMetadata()
)
