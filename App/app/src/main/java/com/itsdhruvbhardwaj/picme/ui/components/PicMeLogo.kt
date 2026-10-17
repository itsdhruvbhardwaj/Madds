package com.itsdhruvbhardwaj.picme.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.itsdhruvbhardwaj.picme.ui.theme.BlueAccent
import com.itsdhruvbhardwaj.picme.ui.theme.PurpleAccent

@Composable
fun PicMeLogo(
    modifier: Modifier = Modifier,
    showTagline: Boolean = false,
    fontSize: Int = 48,
    tint: Color? = null
) {
    val navyColor = Color(0xFF0F172A)
    val baseColor = tint ?: navyColor
    
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = buildAnnotatedString {
                // "Pic" part
                withStyle(
                    style = SpanStyle(
                        color = baseColor,
                        fontWeight = FontWeight.Black
                    )
                ) {
                    append("Pic")
                }
                
                // "Me" part - with gradient if no tint, otherwise solid tint
                if (tint != null) {
                    withStyle(
                        style = SpanStyle(
                            color = tint,
                            fontWeight = FontWeight.Black
                        )
                    ) {
                        append("Me")
                    }
                } else {
                    withStyle(
                        style = SpanStyle(
                            brush = Brush.horizontalGradient(
                                colors = listOf(PurpleAccent, BlueAccent)
                            ),
                            fontWeight = FontWeight.Black
                        )
                    ) {
                        append("Me")
                    }
                }
            },
            style = MaterialTheme.typography.displayLarge.copy(
                fontSize = fontSize.sp,
                letterSpacing = (-2.5).sp,
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
