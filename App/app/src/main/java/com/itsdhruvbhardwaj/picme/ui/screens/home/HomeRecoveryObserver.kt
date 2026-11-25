package com.itsdhruvbhardwaj.picme.ui.screens.home

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

@Composable
internal fun ObserveHomeRecovery(viewModel: HomeViewModel) {
    val context = LocalContext.current.applicationContext
    val owner = LocalLifecycleOwner.current
    DisposableEffect(viewModel, owner, context) {
        val handler = Handler(Looper.getMainLooper())
        var disposed = false
        val observer = LifecycleEventObserver { _, _ ->
            viewModel.setHomeActive(owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED))
        }
        owner.lifecycle.addObserver(observer)
        viewModel.setHomeActive(owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED))
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val callback = object : ConnectivityManager.NetworkCallback() {
            private var validated: Network? = null
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                    if (validated != network) handler.post { if (!disposed) viewModel.onConnectionRestored() }
                    validated = network
                } else if (validated == network) validated = null
            }
            override fun onLost(network: Network) { if (validated == network) validated = null }
        }
        val registered = runCatching { manager?.registerDefaultNetworkCallback(callback); manager != null }.getOrDefault(false)
        onDispose {
            disposed = true
            owner.lifecycle.removeObserver(observer)
            viewModel.setHomeActive(false)
            if (registered) runCatching { manager?.unregisterNetworkCallback(callback) }
        }
    }
}
