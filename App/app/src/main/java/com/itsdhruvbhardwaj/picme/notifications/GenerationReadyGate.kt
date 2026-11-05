package com.itsdhruvbhardwaj.picme.notifications

/** Server completion can precede downloading and decoding the image on this phone. */
internal class GenerationReadyGate {
    private var owner: String? = null
    private var focusedId: String? = null
    private val displayed = linkedSetOf<Pair<String, String>>()

    fun watch(owner: String?, id: String?) {
        this.owner = owner
        focusedId = id
    }

    fun imageDisplayed(owner: String, id: String) {
        displayed += owner to id
        while (displayed.size > 256) displayed.remove(displayed.first())
    }

    fun shouldDefer(owner: String, id: String): Boolean {
        val focused = focusedId ?: return false
        // Before submission resolves, focus is a local UUID rather than the server ID.
        return this.owner == owner && (focused == id || !Regex("[a-fA-F0-9]{24}").matches(focused)) &&
            (owner to id) !in displayed
    }
}
