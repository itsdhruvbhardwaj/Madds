package com.itsdhruvbhardwaj.picme.navigation

import com.itsdhruvbhardwaj.picme.data.model.User

/** Missing flags from older accounts/caches never opt them into a new setup step. */
fun nextAccountSetup(user: User?, avatarOfferedForUser: String?): Screen? = when {
    user == null -> null
    user.profileSetupComplete == false && avatarOfferedForUser != user.id -> Screen.EditAvatar
    user.stylePreferenceSetupComplete == false -> Screen.StylePreferenceSetup
    else -> null
}
