package com.itsdhruvbhardwaj.picme.data.remote

import com.itsdhruvbhardwaj.picme.data.model.FavoritesResponse
import com.itsdhruvbhardwaj.picme.data.model.GenerationResponse
import com.itsdhruvbhardwaj.picme.data.model.HomeConfigResponse
import com.itsdhruvbhardwaj.picme.data.model.StyleResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

interface StyleApiService {
    @GET("api/styles")
    suspend fun getStyles(
        @Header("Authorization") authorization: String? = null,
        @Query("page") page: Int,
        @Query("limit") limit: Int,
        @Query("collection") collection: String? = null,
        @Query("search") search: String? = null,
        @Query("trendingFirst") trendingFirst: Boolean = false
    ): Response<StyleResponse>

    @GET("api/home/config")
    suspend fun getHomeConfig(): Response<HomeConfigResponse>

    @Multipart
    @POST("api/generate")
    suspend fun generateImage(
        @Header("Authorization") authorization: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Part("styleId") styleId: RequestBody,
        @Part images: List<MultipartBody.Part>
    ): Response<GenerationResponse>

    @Multipart
    @POST("api/generate")
    suspend fun generateCustomImage(
        @Header("Authorization") authorization: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Part("prompt") prompt: RequestBody,
        @Part images: List<MultipartBody.Part>
    ): Response<GenerationResponse>

    @GET("api/me/favorites")
    suspend fun getFavorites(
        @Header("Authorization") authorization: String
    ): Response<FavoritesResponse>

    @PUT("api/me/favorites/{styleId}")
    suspend fun addFavorite(
        @Header("Authorization") authorization: String,
        @Path("styleId") styleId: String
    ): Response<Unit>

    @DELETE("api/me/favorites/{styleId}")
    suspend fun removeFavorite(
        @Header("Authorization") authorization: String,
        @Path("styleId") styleId: String
    ): Response<Unit>
}
