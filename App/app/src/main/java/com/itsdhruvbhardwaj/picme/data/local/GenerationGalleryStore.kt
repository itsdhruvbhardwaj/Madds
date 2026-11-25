package com.itsdhruvbhardwaj.picme.data.local

import android.content.Context
import android.net.Uri
import java.io.File
import java.security.MessageDigest

/** User photos never enter the public style image cache or Android backups. */
class GenerationGalleryStore(context: Context) {
    private val root = File(context.cacheDir, "private-generations")
    private val saved = context.getSharedPreferences("madds_saved_generations", Context.MODE_PRIVATE)
    private var activeOwner: String? = saved.getString("thumbnail_owner", null)
    private fun hash(value: String) = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
        .joinToString("") { "%02x".format(it) }

    @Synchronized fun bind(owner: String?) {
        if (activeOwner != owner) {
            root.deleteRecursively(); activeOwner = owner
            saved.edit().putString("thumbnail_owner", owner).commit()
        }
        prune()
    }
    @Synchronized fun prune(now: Long = System.currentTimeMillis()) {
        root.listFiles()?.filter { (it.name.substringBefore('_').toLongOrNull() ?: 0) <= now }?.forEach { it.delete() }
        var total = root.listFiles()?.sumOf { it.length() } ?: 0
        root.listFiles()?.sortedBy { it.lastModified() }?.forEach {
            if (total > 20L * 1024 * 1024) { total -= it.length(); it.delete() }
        }
    }
    @Synchronized fun thumbnail(owner: String, id: String, expires: Long): File? {
        if (owner != activeOwner || saved.getString("thumbnail_owner", null) != owner || expires <= System.currentTimeMillis()) return null
        prune()
        return File(root, "${expires}_${hash("$owner:$id")}.webp").takeIf { it.isFile }
    }
    @Synchronized fun putThumbnail(owner: String, id: String, expires: Long, bytes: ByteArray): File? {
        if (owner != activeOwner || saved.getString("thumbnail_owner", null) != owner || expires <= System.currentTimeMillis() || bytes.size > 512 * 1024) return null
        root.mkdirs()
        val file = File(root, "${expires}_${hash("$owner:$id")}.webp")
        val pending = File(root, "${file.name}.tmp")
        try { pending.writeBytes(bytes); if (!pending.renameTo(file)) return null } finally { pending.delete() }
        prune()
        return file.takeIf { it.exists() }
    }
    @Synchronized fun forgetThumbnail(owner: String, id: String) {
        root.listFiles()?.filter { it.name.endsWith("_${hash("$owner:$id")}.webp") }?.forEach { it.delete() }
    }
    fun savedUri(owner: String, id: String): Uri? = saved.getString(hash("$owner:$id"), null)?.let(Uri::parse)
    fun rememberSaved(owner: String, id: String, uri: Uri) { saved.edit().putString(hash("$owner:$id"), uri.toString()).commit() }
    fun forgetSaved(owner: String, id: String) { saved.edit().remove(hash("$owner:$id")).apply() }
}
