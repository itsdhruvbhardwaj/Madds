package com.itsdhruvbhardwaj.picme.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest

@Composable
fun PicMeLogo(
    modifier: Modifier = Modifier,
    showTagline: Boolean = false,
    fontSize: Int = 48,
    tint: Color? = null
) {
    val baseColor = tint ?: MaterialTheme.colorScheme.onBackground
    val context = LocalContext.current

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        AsyncImage(
            model = ImageRequest.Builder(context)
                .data("file:///android_asset/madds_wordmark.svg")
                .build(),
            contentDescription = "madds",
            modifier = Modifier
                .width(fontSize.dp * 2.4f)
                .height(fontSize.dp * 0.77f),
            contentScale = ContentScale.Fit,
            colorFilter = ColorFilter.tint(baseColor)
        )
        if (showTagline) {
            Text(
                text = "Turn Your Photos\nInto Amazing Creations",
                style = MaterialTheme.typography.bodyLarge.copy(
                    lineHeight = 22.sp,
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp
                ),
                color = baseColor.copy(alpha = 0.8f),
                modifier = Modifier.padding(top = 12.dp),
                textAlign = TextAlign.Center
            )
        }
    }
}
