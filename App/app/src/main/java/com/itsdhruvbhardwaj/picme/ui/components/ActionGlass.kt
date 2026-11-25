package com.itsdhruvbhardwaj.picme.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.*

/** The dock and tour use exactly the same blur, neutral tint, highlights and border. */
fun Modifier.actionGlass(hazeState:HazeState,shape:Shape):Modifier = clip(shape)
    .hazeEffect(hazeState,style=HazeStyle(backgroundColor=Color.Black,
        tints=listOf(HazeTint(Color.White.copy(alpha=.06f)),HazeTint(Color.Black.copy(alpha=.12f))),
        blurRadius=36.dp,noiseFactor=.025f,fallbackTint=HazeTint(Color.Black.copy(alpha=.86f))))
    .background(Brush.linearGradient(listOf(Color.White.copy(alpha=.08f),Color.Transparent,Color.White.copy(alpha=.02f))),shape)
    .border(1.dp,Brush.linearGradient(listOf(Color.White.copy(alpha=.36f),Color.White.copy(alpha=.06f),Color.White.copy(alpha=.18f))),shape)
