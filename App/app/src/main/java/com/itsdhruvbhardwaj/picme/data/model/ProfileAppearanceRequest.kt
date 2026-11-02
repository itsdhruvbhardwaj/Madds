package com.itsdhruvbhardwaj.picme.data.model

data class ProfileAppearanceRequest(
    val profileAppearance: String? = null,
    val avatarId: String? = null,
    val avatarBackground: String? = null,
    val skip: Boolean = false
)
