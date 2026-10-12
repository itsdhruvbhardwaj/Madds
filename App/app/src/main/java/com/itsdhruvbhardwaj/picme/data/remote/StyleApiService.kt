package com.itsdhruvbhardwaj.picme.data.remote

import com.itsdhruvbhardwaj.picme.data.model.GenerationResponse
import com.itsdhruvbhardwaj.picme.data.model.HomeConfigResponse
import com.itsdhruvbhardwaj.picme.data.model.StyleResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Query

interface StyleApiService {
    @GET("api/styles")
    suspend fun getStyles(
        @Query("page") page: Int,
        @Query("limit") limit: Int,
        @Query("category") category: String? = null,
        @Query("collection") collection: String? = null
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
}
