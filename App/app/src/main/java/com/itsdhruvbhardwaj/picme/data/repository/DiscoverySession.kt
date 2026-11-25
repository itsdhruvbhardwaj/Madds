package com.itsdhruvbhardwaj.picme.data.repository

/** Fresh after process restart; retained through Activity recreation and tab changes. */
internal object DiscoverySession {
    val seed: String = java.util.UUID.randomUUID().toString()
}
