package com.itsdhruvbhardwaj.picme.ui.components

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.geometry.*
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.*
import dev.chrisbanes.haze.HazeState
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

@Stable class AppTourTargets { val bounds=mutableStateMapOf<String,Rect>() }
val LocalAppTourTargets=staticCompositionLocalOf<AppTourTargets?>{null}
fun Modifier.appTourTarget(id:String):Modifier=composed {
    val targets=LocalAppTourTargets.current
    DisposableEffect(targets,id){onDispose{targets?.bounds?.remove(id)}}
    onGloballyPositioned{coordinates->if(coordinates.isAttached)targets?.bounds?.set(id,coordinates.boundsInWindow())}
}
private data class TourStep(val target:String,val title:String,val description:String)
private val steps=listOf(
    TourStep("style","Find your next look","Choose a style to turn your photo into something new."),
    TourStep("see_all","Explore the collection","Tap See All to discover more styles in a collection."),
    TourStep("dock","Credits and your preferences","Check your credits, buy more, and choose styles for him, her, or everyone."),
    TourStep("explore","Discover more in Explore","Use the search tab to browse and find styles that match the look you have in mind."),
    TourStep("collections","Browse Collections","Find styles grouped into collections, from traditional looks to cinematic portraits and digital art."),
    TourStep("favourites","Keep your favourites","Tap the heart on a style to save it. Open this tab to find your favourite styles again."),
    TourStep("profile","Make Madds yours","Open your profile for account options and My Generations. Download creations you want to keep; My Generations shows images saved on this device.")
)

/** A spotlight on real controls; no generated image, ad or credit spend is needed. */
@Composable
fun AppTourOverlay(targets:AppTourTargets,hazeState:HazeState,onFinish:(String)->Unit) {
    var step by rememberSaveable{mutableIntStateOf(0)}
    var origin by remember{mutableStateOf(Offset.Zero)}
    var panelHeight by remember{mutableIntStateOf(0)}
    val density=LocalDensity.current
    val gold=Color(0xFFE1C477)
    BackHandler{onFinish("SKIP")}
    val current=steps[step]
    val target=targets.bounds[current.target]
    // Lazy content may disappear during a refresh. Never trap the user waiting for it.
    LaunchedEffect(step,target){if(target==null){delay(1800);if(step<steps.lastIndex)step++ else onFinish("COMPLETE")}}
    BoxWithConstraints(Modifier.fillMaxSize().onGloballyPositioned{origin=it.boundsInWindow().topLeft}
        .pointerInput(Unit){detectTapGestures{}}.semantics{isTraversalGroup=true}) {
        val width=constraints.maxWidth.toFloat();val height=constraints.maxHeight.toFloat()
        val inset=WindowInsets.safeDrawing
        val top=with(density){inset.getTop(this).toFloat()+12.dp.toPx()}
        val bottom=height-with(density){inset.getBottom(this).toFloat()+12.dp.toPx()}
        val margin=with(density){16.dp.toPx()};val gap=with(density){14.dp.toPx()}
        val visibleTarget=target?.translate(-origin)?.intersect(Rect(0f,top,width,bottom))?.takeIf{it.width>0&&it.height>0}
        Canvas(Modifier.fillMaxSize()) {
            val path=Path().apply {
                fillType=PathFillType.EvenOdd;addRect(Rect(Offset.Zero,size))
                visibleTarget?.let{addRoundRect(RoundRect(it.inflate(4.dp.toPx()),CornerRadius(18.dp.toPx())))}
            }
            drawPath(path,Color.Black.copy(alpha=.7f))
            visibleTarget?.let{drawRoundRect(gold,it.inflate(4.dp.toPx()).topLeft,it.inflate(4.dp.toPx()).size,CornerRadius(18.dp.toPx()),style=Stroke(2.dp.toPx()))}
        }
        val below=visibleTarget?.bottom?.plus(gap)?:top
        val above=visibleTarget?.top?.minus(gap)?:bottom
        val useBelow=visibleTarget==null || bottom-below>=panelHeight || bottom-below>=above-top
        val available=(if(useBelow)bottom-below else above-top).coerceAtLeast(with(density){120.dp.toPx()})
        val maxPanelHeight=available.coerceAtMost((bottom-top).coerceAtLeast(1f))
        val y=(if(useBelow)below else above-panelHeight).coerceIn(top,(bottom-panelHeight).coerceAtLeast(top))
        Column(Modifier.offset{IntOffset(margin.roundToInt(),y.roundToInt())}
            .width(with(density){(width-2*margin).coerceAtLeast(1f).toDp()})
            .heightIn(max=with(density){maxPanelHeight.toDp()})
            .onGloballyPositioned{panelHeight=it.size.height}
            .actionGlass(hazeState,RoundedCornerShape(24.dp))
            .semantics{paneTitle="Madds app tour";liveRegion=LiveRegionMode.Polite}
            .verticalScroll(rememberScrollState()).padding(20.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text("WELCOME TO MADDS",color=gold,style=MaterialTheme.typography.labelMedium)
            Text(current.title,color=Color.White,style=MaterialTheme.typography.titleLarge)
            Text(current.description,color=Color.White.copy(alpha=.85f),style=MaterialTheme.typography.bodyMedium)
            Text("${step+1} of ${steps.size}",color=gold,style=MaterialTheme.typography.labelMedium)
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween){
                TextButton(onClick={onFinish("SKIP")}){Text("Skip tour",color=Color.LightGray)}
                Button(onClick={if(step==steps.lastIndex)onFinish("COMPLETE") else step++},
                    colors=ButtonDefaults.buttonColors(containerColor=gold,contentColor=Color.Black)){
                    Text(if(step==steps.lastIndex)"Start exploring" else "Next")
                }
            }
        }
    }
}
