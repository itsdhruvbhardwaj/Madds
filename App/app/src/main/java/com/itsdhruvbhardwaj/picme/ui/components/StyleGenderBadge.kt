package com.itsdhruvbhardwaj.picme.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.itsdhruvbhardwaj.picme.data.model.genderTagLabel

@Composable
fun StyleGenderBadge(tag: String?, modifier: Modifier = Modifier, details: Boolean = false) {
    val label = genderTagLabel(tag) ?: return
    val gold = MaterialTheme.colorScheme.primary
    Surface(modifier, shape = RoundedCornerShape(50), color = Color(0xDB151714),
        border = BorderStroke(.7.dp, gold.copy(alpha = .75f))) {
        Text(if (details) "Best suited ${label.lowercase()}" else label,
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
            color = gold, fontSize = 11.sp, lineHeight = 15.sp,
            fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
