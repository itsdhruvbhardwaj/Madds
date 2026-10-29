package com.itsdhruvbhardwaj.picme.ui.components

import android.content.Context
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
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
import coil.ImageLoader
import coil.compose.AsyncImage
import coil.decode.SvgDecoder
import coil.request.ImageRequest

private object MaddsLogoImageLoader {
    @Volatile
    private var shared: ImageLoader? = null

    fun get(context: Context): ImageLoader = shared ?: synchronized(this) {
        shared ?: ImageLoader.Builder(context.applicationContext)
            .components { add(SvgDecoder.Factory()) }
            .build()
            .also { shared = it }
    }
}

@Composable
fun PicMeLogo(
    modifier: Modifier = Modifier,
    showTagline: Boolean = false,
    fontSize: Int = 48,
    tint: Color? = null
) {
    val baseColor = tint ?: MaterialTheme.colorScheme.onBackground
    val context = LocalContext.current
    val imageLoader = remember(context.applicationContext) { MaddsLogoImageLoader.get(context) }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        AsyncImage(
            model = ImageRequest.Builder(context)
                .data("file:///android_asset/madds_wordmark.svg")
                .build(),
            imageLoader = imageLoader,
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
