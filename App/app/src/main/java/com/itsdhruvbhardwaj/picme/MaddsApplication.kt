package com.itsdhruvbhardwaj.picme

import android.app.ActivityManager
import android.app.Application
import android.util.Log
import coil.EventListener
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.decode.SvgDecoder
import coil.disk.DiskCache
import coil.memory.MemoryCache
import coil.request.CachePolicy
import coil.request.ImageRequest
import coil.request.SuccessResult
import java.io.File

/** One loader for Compose, bundled SVGs, and all public remote image requests. */
class MaddsApplication : Application(), ImageLoaderFactory {
    override fun newImageLoader(): ImageLoader {
        val lowRam = getSystemService(ActivityManager::class.java)?.isLowRamDevice == true
        return ImageLoader.Builder(this)
            .components { add(SvgDecoder.Factory()) }
            .memoryCache {
                MemoryCache.Builder(this).maxSizePercent(if (lowRam) 0.15 else 0.20).build()
            }
            .diskCache {
                // Reuse Coil's previous default directory, including existing downloads.
                DiskCache.Builder().directory(File(cacheDir, "image_cache"))
                    .maxSizeBytes(250L * 1024 * 1024).build()
            }
            .memoryCachePolicy(CachePolicy.ENABLED)
            .diskCachePolicy(CachePolicy.ENABLED)
            .networkCachePolicy(CachePolicy.ENABLED)
            .respectCacheHeaders(true)
            .apply {
                if (BuildConfig.DEBUG) eventListener(object : EventListener {
                    override fun onSuccess(request: ImageRequest, result: SuccessResult) {
                        // Never log image URLs, user photos, or account details.
                        Log.d("MaddsImageCache", "source=${result.dataSource}")
                    }
                })
            }
            .build()
    }
}
