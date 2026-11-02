package com.itsdhruvbhardwaj.picme.data.remote

import com.itsdhruvbhardwaj.picme.data.model.FavoritesResponse
import com.itsdhruvbhardwaj.picme.data.model.CollectionsResponse
import com.itsdhruvbhardwaj.picme.data.model.GenerationResponse
import com.itsdhruvbhardwaj.picme.data.model.HomeConfigResponse
import com.itsdhruvbhardwaj.picme.data.model.StyleResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.*

interface StyleApiService {
    @GET("api/generations")
    suspend fun generationOperations(@Header("Authorization") auth: String): Response<com.itsdhruvbhardwaj.picme.data.model.GenerationOperationsResponse>
    @GET("api/generations/by-key/{key}")
    suspend fun generationByKey(@Header("Authorization") auth: String, @Path("key") key: String): Response<com.itsdhruvbhardwaj.picme.data.model.RecoverableGeneration>
    @GET("api/generations/{id}/result")
    suspend fun generationResult(@Header("Authorization") auth: String, @Path("id") id: String): Response<GenerationResponse>
    @POST("api/generations/{id}/viewed")
    suspend fun generationViewed(@Header("Authorization") auth: String, @Path("id") id: String): Response<Unit>
    @GET("api/styles/{styleId}")
    suspend fun getStyle(@Header("Authorization") authorization: String? = null, @Path("styleId") styleId: String): Response<StyleDetailsResponse>
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
    suspend fun getHomeConfig(@Query("includeStyles") includeStyles: Boolean = true): Response<HomeConfigResponse>

    @GET("api/collections")
    suspend fun getCollections(): Response<CollectionsResponse>

    @Multipart
    @Headers("X-Generation-Recovery: 1")
    @POST("api/generate")
    suspend fun generateImage(
        @Header("Authorization") authorization: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Part("styleId") styleId: RequestBody,
        @Part images: List<MultipartBody.Part>
    ): Response<GenerationResponse>

    @Multipart
    @Headers("X-Generation-Recovery: 1")
    @POST("api/generate")
    suspend fun generateCustomImage(
        @Header("Authorization") authorization: String,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Part("customPrompt") prompt: RequestBody,
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
