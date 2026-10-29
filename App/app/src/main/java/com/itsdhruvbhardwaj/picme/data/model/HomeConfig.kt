package com.itsdhruvbhardwaj.picme.data.model

/**
 * Data model for a Home screen section configuration.
 *
 * @property id Unique identifier for the section.
 * @property title Display title for the section (e.g., "Trending Styles").
 * @property type Type of section (e.g., "collection", "popular").
 * @property slug The slug used to filter styles if type is "collection".
 * @property visible Whether the section should be displayed.
 * @property order Display order of the section.
 */
data class HomeSection(
    val id: String,
    val title: String,
    val type: String,
    val slug: String? = null,
    val visible: Boolean = true,
    val order: Int = 0
)

/**
 * Data model for the Home configuration response.
 */
data class HomeConfigResponse(
    val sections: List<HomeSection> = emptyList()
)

data class StyleCollection(
    val id: String = "",
    val name: String = ""
)

data class CollectionsResponse(
    val collections: List<StyleCollection> = emptyList()
)
