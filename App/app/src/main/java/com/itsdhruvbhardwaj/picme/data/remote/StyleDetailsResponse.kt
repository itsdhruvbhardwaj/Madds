package com.itsdhruvbhardwaj.picme.data.remote

import com.google.gson.annotations.SerializedName
import com.itsdhruvbhardwaj.picme.data.model.Style

data class StyleDetailsResponse(@SerializedName("style") val style: Style? = null)
