package com.itsdhruvbhardwaj.picme

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import com.itsdhruvbhardwaj.picme.ui.components.*
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import java.io.File

class AppTourOverlayTest {
    @get:Rule val compose=createComposeRule()
    private fun fixture(onFinish:(String)->Unit) {
        compose.setContent {
            MaterialTheme {
                val targets=remember{AppTourTargets()};val haze=remember{HazeState()}
                CompositionLocalProvider(LocalAppTourTargets provides targets) {
                    Box(Modifier.fillMaxSize().background(Color(0xFF111213))) {
                        Column(Modifier.fillMaxSize().hazeSource(haze).padding(20.dp)) {
                            Text("madds     Home",color=Color.White)
                            Spacer(Modifier.height(20.dp))
                            Text("See All",Modifier.appTourTarget("see_all").align(Alignment.End),color=Color.White)
                            Row {
                                Box(Modifier.size(148.dp,208.dp).appTourTarget("style").background(Color(0xFF80604C))) {
                                    Text("Classic Red Silk",color=Color.White,modifier=Modifier.align(Alignment.BottomStart).padding(12.dp))
                                }
                                Spacer(Modifier.weight(1f))
                                Box(Modifier.size(60.dp,150.dp).appTourTarget("dock").actionGlass(haze,androidx.compose.foundation.shape.RoundedCornerShape(20.dp))) {
                                    Text("Credits\n\nFilter",color=Color.White,modifier=Modifier.padding(8.dp))
                                }
                            }
                            Spacer(Modifier.weight(1f))
                            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
                                Text("Explore",Modifier.appTourTarget("explore"),color=Color.White)
                                Text("Collections",Modifier.appTourTarget("collections"),color=Color.White)
                                Text("Favourites",Modifier.appTourTarget("favourites"),color=Color.White)
                                Text("Profile",Modifier.appTourTarget("profile"),color=Color.White)
                            }
                        }
                        AppTourOverlay(targets,haze,onFinish)
                    }
                }
            }
        }
    }
    @Test fun allStepsKeepNextAndSkipReachableAndComplete() {
        var action:String?=null;fixture{action=it}
        compose.onNodeWithText("Find your next look").assertIsDisplayed()
        compose.onNodeWithText("Skip tour").assertIsDisplayed()
        val bitmap=compose.onRoot().captureToImage().asAndroidBitmap()
        val file=File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir,"tour-layout.png")
        file.outputStream().use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
        compose.onNodeWithText("Next").performClick()
        compose.onNodeWithText("Explore the collection").assertIsDisplayed()
        compose.onNodeWithText("Next").performClick()
        compose.onNodeWithText("Credits and your preferences").assertIsDisplayed()
        compose.onNodeWithText("Next").performClick()
        compose.onNodeWithText("Discover more in Explore").assertIsDisplayed()
        compose.onNodeWithText("Next").performClick()
        compose.onNodeWithText("Browse Collections").assertIsDisplayed()
        compose.onNodeWithText("Next").performClick()
        compose.onNodeWithText("Keep your favourites").assertIsDisplayed()
        compose.onNodeWithText("Next").performClick()
        compose.onNodeWithText("Make Madds yours").assertIsDisplayed()
        compose.onNodeWithText("Start exploring").performClick()
        compose.runOnIdle{assertEquals("COMPLETE",action)}
    }
    @Test fun skipIsAvailableWithoutCompletingSteps() {
        var action:String?=null;fixture{action=it}
        compose.onNodeWithText("Skip tour").performClick()
        compose.runOnIdle{assertEquals("SKIP",action)}
    }
}
