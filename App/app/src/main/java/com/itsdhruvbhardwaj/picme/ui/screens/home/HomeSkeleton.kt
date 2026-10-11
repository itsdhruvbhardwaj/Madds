package com.itsdhruvbhardwaj.picme.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.itsdhruvbhardwaj.picme.ui.components.shimmer

@Composable
fun HomeSkeleton() {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 24.dp),
        userScrollEnabled = false
    ) {
        // Search Bar Placeholder
        item {
            Box(
                modifier = Modifier
                    .padding(horizontal = 24.dp, vertical = 8.dp)
                    .fillMaxWidth()
                    .height(56.dp)
                    .clip(RoundedCornerShape(28.dp))
                    .shimmer()
            )
        }

        // Category Chips Placeholder
        item {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 24.dp, vertical = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                userScrollEnabled = false
            ) {
                items(5) {
                    Box(
                        modifier = Modifier
                            .width(80.dp)
                            .height(40.dp)
                            .clip(RoundedCornerShape(20.dp))
                            .shimmer()
                    )
                }
            }
        }

        // Dynamic Sections Placeholders
        items(3) {
            SectionSkeleton()
        }
    }
}

@Composable
fun SectionSkeleton() {
    Column(modifier = Modifier.padding(vertical = 8.dp)) {
        // Section Header Placeholder
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .width(140.dp)
                    .height(24.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .shimmer()
            )
            Box(
                modifier = Modifier
                    .width(50.dp)
                    .height(20.dp)
                    .clip(RoundedCornerShape(4.dp))
                    .shimmer()
            )
        }

        // Horizontal Style Cards Placeholder
        LazyRow(
            contentPadding = PaddingValues(horizontal = 24.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            userScrollEnabled = false
        ) {
            items(4) {
                Box(
                    modifier = Modifier
                        .width(160.dp)
                        .height(220.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .shimmer()
                )
            }
        }
    }
}
