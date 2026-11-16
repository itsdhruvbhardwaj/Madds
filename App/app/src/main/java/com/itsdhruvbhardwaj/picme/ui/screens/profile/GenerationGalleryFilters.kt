package com.itsdhruvbhardwaj.picme.ui.screens.profile

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun GenerationGalleryFilters(
    selected: GenerationGalleryTab,
    onSelect: (GenerationGalleryTab) -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier.widthIn(max = 280.dp).fillMaxWidth(),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.96f),
        border = BorderStroke(0.7.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)),
        tonalElevation = 0.dp,
        shadowElevation = 8.dp
    ) {
        Row(Modifier.padding(3.dp).selectableGroup(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            GenerationGalleryTab.entries.forEach { tab ->
                val active = selected == tab
                val background by animateColorAsState(
                    if (active) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f) else Color.Transparent,
                    tween(180), label = "gallery tab background")
                val foreground by animateColorAsState(
                    if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    tween(180), label = "gallery tab foreground")
                val outline by animateColorAsState(
                    if (active) MaterialTheme.colorScheme.primary.copy(alpha = 0.28f) else Color.Transparent,
                    tween(180), label = "gallery tab outline")
                Row(
                    Modifier.weight(1f).clip(CircleShape).background(background).border(0.7.dp, outline, CircleShape)
                        .selectable(active, role = Role.Tab, onClick = { onSelect(tab) })
                        .heightIn(min = 48.dp).padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(if (tab == GenerationGalleryTab.Unsaved) Icons.Outlined.Schedule else Icons.Outlined.CheckCircle,
                        contentDescription = null, tint = foreground, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(tab.name, color = foreground, style = MaterialTheme.typography.labelLarge,
                        fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}
