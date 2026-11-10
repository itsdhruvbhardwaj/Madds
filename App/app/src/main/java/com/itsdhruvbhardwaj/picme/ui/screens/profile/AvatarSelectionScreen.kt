package com.itsdhruvbhardwaj.picme.ui.screens.profile

import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.itsdhruvbhardwaj.picme.data.model.*
import com.itsdhruvbhardwaj.picme.ui.auth.AuthState
import com.itsdhruvbhardwaj.picme.ui.auth.AuthViewModel
import com.itsdhruvbhardwaj.picme.ui.components.*
import com.itsdhruvbhardwaj.picme.utils.ProfilePhotoProcessor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlin.math.min

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AvatarSelectionScreen(authViewModel: AuthViewModel, onBack: () -> Unit, onSaved: () -> Unit = onBack) {
    val auth by authViewModel.authState.collectAsState()
    val user = (auth as? AuthState.Authenticated)?.user ?: return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val defaults = remember(user.id) { AvatarCatalog.initialSelection(user) }
    var selectedAvatar by rememberSaveable(user.id) { mutableStateOf(defaults.avatarId) }
    var background by rememberSaveable(user.id) { mutableStateOf(defaults.background) }
    var mode by rememberSaveable(user.id) { mutableStateOf(defaults.mode) }
    var tab by rememberSaveable(user.id) { mutableIntStateOf(defaults.tab) }
    var saving by remember { mutableStateOf(false) }
    var loadingPhoto by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var cropSource by remember { mutableStateOf<Bitmap?>(null) }
    var croppedPhoto by remember { mutableStateOf<Bitmap?>(null) }

    fun leave() {
        if (!saving && !loadingPhoto) {
            if (user.profileSetupComplete != false) onBack() else scope.launch {
                saving = true
                try {
                    authViewModel.saveProfileAppearance(ProfileAppearanceRequest(skip = true))
                        // Setup is optional even if connectivity drops. Home
                        // offers it at most once per account in this app session.
                        .also { onBack() }
                } finally { saving = false }
            }
        }
    }
    BackHandler { leave() }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) scope.launch {
            loadingPhoto = true
            error = null
            try { cropSource = ProfilePhotoProcessor.load(context, uri) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { error = "Couldn't open this photo. Please choose another image." }
            finally { loadingPhoto = false }
        }
    }
    fun pickPhoto() { if (!saving && !loadingPhoto) picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }

    Scaffold(
        topBar = { PicMeCompactHeader("Edit avatar", onBackClick = { leave() }, actions = {
            if (user.profileSetupComplete == false) TextButton(onClick = { leave() }, enabled = !saving) { Text("Skip") }
        }) },
        bottomBar = {
            Surface(color = MaterialTheme.colorScheme.background) {
                Column(Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 12.dp)) {
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 8.dp)) }
                    Text("Your avatar syncs with your account", style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.align(Alignment.CenterHorizontally))
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = {
                        scope.launch {
                            saving = true
                            error = null
                            try {
                                val photo = croppedPhoto
                                val result = if (mode == "photo" && photo != null) {
                                    authViewModel.saveProfilePhoto(ProfilePhotoProcessor.jpeg(photo))
                                } else if (mode == "photo") {
                                    authViewModel.saveProfileAppearance(ProfileAppearanceRequest(skip = true))
                                } else authViewModel.saveProfileAppearance(ProfileAppearanceRequest(
                                    profileAppearance = mode, avatarId = selectedAvatar, avatarBackground = background
                                ))
                                result.fold(onSuccess = { onSaved() }, onFailure = { error = it.message ?: "Couldn't save. Please try again." })
                            } catch (cancelled: CancellationException) {
                                throw cancelled
                            } catch (_: Exception) {
                                error = "Couldn't save your profile. Please try again."
                            } finally { saving = false }
                        }
                    }, enabled = !saving && !loadingPhoto, modifier = Modifier.fillMaxWidth().height(52.dp)) {
                        if (saving) CircularProgressIndicator(Modifier.size(22.dp), color = MaterialTheme.colorScheme.onPrimary, strokeWidth = 2.dp)
                        else Text("Save changes", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    ) { padding ->
        LazyVerticalGrid(columns = GridCells.Fixed(4), modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(24.dp), horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Box(Modifier.size(148.dp)) {
                        val photo = croppedPhoto
                        if (mode == "photo" && photo != null) Image(photo.asImageBitmap(), "Profile preview",
                            Modifier.fillMaxSize().clip(CircleShape).border(2.dp, MaterialTheme.colorScheme.primary, CircleShape), contentScale = ContentScale.Crop)
                        else ProfileAvatar(user.copy(profileAppearance = mode, avatarId = selectedAvatar, avatarBackground = background),
                            Modifier.fillMaxSize().border(2.dp, MaterialTheme.colorScheme.primary, CircleShape))
                        FilledIconButton(onClick = { tab = 1; pickPhoto() }, enabled = !saving && !loadingPhoto,
                            modifier = Modifier.align(Alignment.BottomEnd).size(40.dp)) { Icon(Icons.Default.PhotoCamera, "Upload photo") }
                        if (loadingPhoto) CircularProgressIndicator(Modifier.align(Alignment.Center))
                    }
                    Text("Make it yours", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 12.dp))
                    Row(
                        Modifier.fillMaxWidth().height(48.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surface)
                            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                            .padding(1.dp)
                            .selectableGroup()
                    ) {
                        listOf("Avatars", "Upload photo").forEachIndexed { index, label ->
                            val active = tab == index
                            val gold = MaterialTheme.colorScheme.primary
                            Box(
                                Modifier.weight(1f).fillMaxHeight().clip(CircleShape)
                                    .background(Brush.horizontalGradient(
                                        if (active) listOf(gold.copy(alpha = 0.22f), gold.copy(alpha = 0.10f))
                                        else listOf(Color.Transparent, Color.Transparent)
                                    ))
                                    .then(if (active) Modifier.border(1.dp, gold, CircleShape) else Modifier)
                                    .selectable(selected = active, enabled = !saving, role = Role.Tab, onClick = { tab = index }),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(label, style = MaterialTheme.typography.titleSmall,
                                    fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                                    color = if (active) gold else MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
            if (tab == 0) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Column {
                        Text("Background", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(vertical = 8.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            AvatarCatalog.backgrounds.forEach { id ->
                                Box(Modifier.size(42.dp).clip(CircleShape).background(avatarBackgroundBrush(id))
                                    .border(if (id == background) 2.dp else 0.dp, MaterialTheme.colorScheme.primary, CircleShape)
                                    .semantics { contentDescription = "$id background"; selected = id == background }
                                    .clickable(enabled = !saving) { background = id; mode = "avatar" }, contentAlignment = Alignment.Center) {
                                    if (id == background) Icon(Icons.Default.Check, "${id.replaceFirstChar { it.uppercase() }} background selected",
                                        tint = if (id == "charcoal" || id == "slate") androidx.compose.ui.graphics.Color.White else androidx.compose.ui.graphics.Color.Black,
                                        modifier = Modifier.size(18.dp))
                                }
                            }
                        }
                    }
                }
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Choose your avatar", style = MaterialTheme.typography.titleMedium)
                        Text("${AvatarCatalog.avatars.size} styles", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    }
                }
                items(AvatarCatalog.avatars, key = { it.id }) { avatar ->
                    val selected = mode == "avatar" && selectedAvatar == avatar.id
                    Box(Modifier.aspectRatio(1f).clickable(enabled = !saving) { selectedAvatar = avatar.id; mode = "avatar" }) {
                        ProfileAvatar(user.copy(profileAppearance = "avatar", avatarId = avatar.id, avatarBackground = background),
                            Modifier.fillMaxSize().border(if (selected) 2.dp else 0.dp, MaterialTheme.colorScheme.primary, CircleShape), avatar.label)
                        if (selected) Icon(Icons.Default.Check, "Selected", modifier = Modifier.align(Alignment.BottomEnd).size(22.dp)
                            .background(MaterialTheme.colorScheme.primary, CircleShape).padding(3.dp), tint = MaterialTheme.colorScheme.onPrimary)
                    }
                }
            } else item(span = { GridItemSpan(maxLineSpan) }) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp)) {
                    Text("Choose a photo, then crop and reposition it.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(16.dp))
                    OutlinedButton(onClick = { pickPhoto() }, enabled = !saving && !loadingPhoto) { Text("Choose from gallery") }
                    if (croppedPhoto != null) TextButton(onClick = { cropSource = croppedPhoto }, enabled = !saving) { Text("Adjust crop") }
                }
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                TextButton(onClick = {
                    mode = "avatar"
                    selectedAvatar = AvatarCatalog.defaultAvatar.id
                    background = AvatarCatalog.defaultBackground
                    croppedPhoto = null
                    tab = 0
                }, enabled = !saving) { Text("Reset to default") }
            }
        }
    }
    cropSource?.let { source ->
        PhotoCropDialog(source, onDismiss = { cropSource = null }, onCrop = { zoom, x, y ->
            cropSource = null
            loadingPhoto = true
            scope.launch {
                try { croppedPhoto = ProfilePhotoProcessor.crop(source, zoom, x, y); mode = "photo" }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { error = "Couldn't crop this photo. Please choose another image." }
                finally { loadingPhoto = false }
            }
        })
    }
}

@Composable
private fun PhotoCropDialog(source: Bitmap, onDismiss: () -> Unit, onCrop: (Float, Float, Float) -> Unit) {
    var zoom by remember(source) { mutableFloatStateOf(1f) }
    var x by remember(source) { mutableFloatStateOf(0f) }
    var y by remember(source) { mutableFloatStateOf(0f) }
    var side by remember { mutableFloatStateOf(1f) }
    val ratioX = source.width.toFloat() / min(source.width, source.height)
    val ratioY = source.height.toFloat() / min(source.width, source.height)
    fun clampOffsets() {
        val maxX = (ratioX * zoom - 1) / 2
        val maxY = (ratioY * zoom - 1) / 2
        x = x.coerceIn(-maxX, maxX); y = y.coerceIn(-maxY, maxY)
    }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth().padding(20.dp), shape = MaterialTheme.shapes.large) {
            Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Crop profile photo", style = MaterialTheme.typography.titleLarge)
                Text("Drag to reposition · Pinch to zoom", modifier = Modifier.padding(vertical = 12.dp), style = MaterialTheme.typography.bodySmall)
                BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(1f).clip(CircleShape).onSizeChanged { side = it.width.toFloat() }
                    .pointerInput(source) {
                        detectTransformGestures { _, pan, scale, _ ->
                            zoom = (zoom * scale).coerceIn(1f, 4f); x += pan.x / side; y += pan.y / side; clampOffsets()
                        }
                    }) {
                    Image(source.asImageBitmap(), "Crop preview", Modifier.requiredSize(maxWidth * ratioX, maxHeight * ratioY).align(Alignment.Center).graphicsLayer {
                        scaleX = zoom; scaleY = zoom; translationX = x * side; translationY = y * side
                    }, contentScale = ContentScale.FillBounds)
                }
                Slider(value = zoom, onValueChange = { zoom = it; clampOffsets() }, valueRange = 1f..4f)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Button(onClick = { onCrop(zoom, x, y) }) { Text("Use photo") }
                }
            }
        }
    }
}
