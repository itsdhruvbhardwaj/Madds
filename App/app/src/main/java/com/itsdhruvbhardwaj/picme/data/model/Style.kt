package com.itsdhruvbhardwaj.picme.data.model

import com.google.gson.annotations.SerializedName

/**
 * Data model representing a generation style in PicMe.
 */
data class Style(
    @SerializedName("id")
    val id: String = "",
    
    @SerializedName("name")
    val name: String = "",
    
    @SerializedName("description")
    val description: String = "",
    
    @SerializedName("prompt")
    val prompt: String = "",
    
    @SerializedName("thumbnail")
    val thumbnail: String? = null,
    
    @SerializedName("previewImages", alternate = ["preview_images", "previews", "sample_images", "images", "preview_image_urls"])
    val previewImages: List<String>? = emptyList(),
    
    @SerializedName("imageCount", alternate = ["image_count"])
    val imageCount: Int = 1,
    
    @SerializedName("tokensRequired", alternate = ["tokens_required", "price", "cost", "tokens", "credit_cost"])
    val tokensRequired: Int = 0,
    
    @SerializedName("category")
    val category: String = "",
    
    @SerializedName("collections")
    val collections: List<String> = emptyList()
)

data class PaginationMetadata(
    @SerializedName("currentPage", alternate = ["current_page"])
    val currentPage: Int = 1,
    
    @SerializedName("totalPages", alternate = ["total_pages"])
    val totalPages: Int = 1,
    
    @SerializedName("totalCount", alternate = ["total_count"])
    val totalCount: Int = 0,
    
    @SerializedName("hasNextPage", alternate = ["has_next_page"])
    val hasNextPage: Boolean = false
)

data class StyleResponse(
    @SerializedName("styles")
    val styles: List<Style> = emptyList(),
    
    @SerializedName("pagination")
    val pagination: PaginationMetadata = PaginationMetadata()
)
