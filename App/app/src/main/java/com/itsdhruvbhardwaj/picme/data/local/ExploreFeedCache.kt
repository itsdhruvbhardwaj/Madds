package com.itsdhruvbhardwaj.picme.data.local

import com.google.gson.Gson
import com.itsdhruvbhardwaj.picme.data.model.Style
import java.io.File
import java.security.MessageDigest

/** Public metadata only. An offline snapshot is never used as a pagination cursor. */
class ExploreFeedCache(
    private val directory: File,
    private val now: () -> Long = System::currentTimeMillis
) {
    @androidx.annotation.Keep
    private data class Snapshot(val savedAt: Long, val styles: List<Style>)
    private val gson = Gson()

    @Synchronized
    fun read(preference: String, collection: String?, query: String): List<Style>? = runCatching {
        val file = file(preference, collection, query)
        if (!file.exists() || file.length() > MAX_BYTES) return null
        val snapshot = gson.fromJson(file.readText(), Snapshot::class.java)
        if (now() - snapshot.savedAt !in 0..MAX_AGE || snapshot.styles.size > MAX_STYLES) {
            file.delete()
            return null
        }
        snapshot.styles.map { it.copy(isFavorite = false, prompt = "") }
    }.getOrNull()

    @Synchronized
    fun write(preference: String, collection: String?, query: String, styles: List<Style>) {
        runCatching {
            directory.mkdirs()
            val publicStyles = styles.distinctBy { it.id }.take(MAX_STYLES)
                .map { it.copy(isFavorite = false, prompt = "") }
            val json = gson.toJson(Snapshot(now(), publicStyles))
            if (json.toByteArray(Charsets.UTF_8).size > MAX_BYTES) return
            val target = file(preference, collection, query)
            val temporary = File(directory, target.name + ".tmp")
            temporary.writeText(json)
            if (!temporary.renameTo(target)) { temporary.delete(); return }
            target.setLastModified(now())
            val entries = directory.listFiles()?.filter { it.extension == "json" }
                ?.sortedByDescending { it.lastModified() }.orEmpty()
            var bytes = 0L
            entries.forEachIndexed { index, entry ->
                bytes += entry.length()
                if (index >= 8 || bytes > MAX_BYTES) entry.delete()
            }
        }
    }

    private fun file(preference: String, collection: String?, query: String): File {
        val identity = gson.toJson(listOf(preference, collection, query.trim()))
        val hash = MessageDigest.getInstance("SHA-256").digest(identity.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        return File(directory, "$hash.json")
    }

    companion object {
        private const val MAX_BYTES = 4L * 1024 * 1024
        private const val MAX_STYLES = 600
        private const val MAX_AGE = 7L * 24 * 60 * 60 * 1000
    }
}
