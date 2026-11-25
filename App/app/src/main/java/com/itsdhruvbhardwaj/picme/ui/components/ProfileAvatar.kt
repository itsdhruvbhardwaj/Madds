package com.itsdhruvbhardwaj.picme.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import coil.compose.AsyncImage
import com.itsdhruvbhardwaj.picme.data.model.AvatarCatalog
import com.itsdhruvbhardwaj.picme.data.model.User

fun avatarBackgroundBrush(id: String?): Brush = when (id) {
    "ivory" -> Brush.linearGradient(listOf(Color(0xFFF0E3C8), Color(0xFFD4C19B)))
    "clay" -> Brush.linearGradient(listOf(Color(0xFFD79C79), Color(0xFFA56F54)))
    "sage" -> Brush.linearGradient(listOf(Color(0xFF9BA68A), Color(0xFF64715C)))
    "slate" -> Brush.linearGradient(listOf(Color(0xFF8899AC), Color(0xFF4F6074)))
    "charcoal" -> Brush.linearGradient(listOf(Color(0xFF46484B), Color(0xFF222324)))
    else -> Brush.linearGradient(listOf(Color(0xFFFFE8B0), Color(0xFFB88C43), Color(0xFFE8CE91)))
}

@Composable
fun ProfileAvatar(user: User?, modifier: Modifier = Modifier, contentDescription: String? = "Profile") {
    val avatar = if (user?.profileAppearance == "avatar") AvatarCatalog.find(user.avatarId) else null
    val photo = user?.profileImage?.takeIf { (user.profileAppearance ?: "photo") == "photo" && it.startsWith("https://") }
    val fallback = AvatarCatalog.defaultAvatar
    val background = if (avatar != null) user?.avatarBackground else AvatarCatalog.defaultBackground
    Box(modifier.clip(CircleShape).background(avatarBackgroundBrush(background))) {
        AsyncImage(
            model = avatar?.drawable ?: photo ?: fallback.drawable,
            contentDescription = contentDescription,
            modifier = Modifier.fillMaxSize(),
            error = painterResource(fallback.drawable),
            placeholder = painterResource(avatar?.drawable ?: fallback.drawable),
            contentScale = if (photo == null) ContentScale.Fit else ContentScale.Crop
        )
    }
}
