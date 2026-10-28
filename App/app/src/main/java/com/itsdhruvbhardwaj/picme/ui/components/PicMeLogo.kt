package com.itsdhruvbhardwaj.picme.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun PicMeLogo(
    modifier: Modifier = Modifier,
    showTagline: Boolean = false,
    fontSize: Int = 48,
    tint: Color? = null
) {
    val baseColor = tint ?: MaterialTheme.colorScheme.onBackground

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "madds",
            style = MaterialTheme.typography.displayLarge.copy(
                fontSize = fontSize.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = (-1.2).sp,
                color = baseColor,
                textAlign = TextAlign.Center
            )
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
