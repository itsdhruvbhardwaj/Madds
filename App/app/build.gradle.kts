plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.itsdhruvbhardwaj.picme"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.itsdhruvbhardwaj.picme"
        minSdk = 24
        targetSdk = 37
        versionCode = 2
        versionName = "1.1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "BACKEND_BASE_URL", "\"https://picme-ai.onrender.com/\"")
        buildConfigField("String", "GOOGLE_CLIENT_ID", "\"444690875641-gpg9b7j4p5dnmfprcrgmaaf96kdvvcd8.apps.googleusercontent.com\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            buildConfigField("String", "AD_UNIT_ID_BANNER", "\"ca-app-pub-7668637948120420/8612192994\"") // Placeholder production ID
            buildConfigField("String", "AD_UNIT_ID_INTERSTITIAL", "\"ca-app-pub-7668637948120420/5567540939\"") // Placeholder production ID
            buildConfigField("String", "AD_UNIT_ID_REWARDED", "\"ca-app-pub-7668637948120420/1843520466\"")
        }
        debug {
            buildConfigField("String", "AD_UNIT_ID_BANNER", "\"ca-app-pub-3940256099942544/9214589741\"")
            buildConfigField("String", "AD_UNIT_ID_INTERSTITIAL", "\"ca-app-pub-3940256099942544/1033173712\"")
            //buildConfigField("String", "AD_UNIT_ID_REWARDED", "\"ca-app-pub-3940256099942544/5224354917\"")
            buildConfigField("String", "AD_UNIT_ID_REWARDED", "\"ca-app-pub-7668637948120420/1843520466\"")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    // Activity Result APIs require FragmentActivity-compatible fragment versions.
    implementation(libs.androidx.fragment.ktx)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    
    // Navigation
    implementation(libs.androidx.navigation.compose)
    
    // Retrofit
    implementation(libs.retrofit)
    implementation(libs.retrofit.converter.gson)
    
    // Security
    implementation(libs.androidx.security.crypto)

    // Coil
    implementation(libs.coil.compose)

    // Google Mobile Ads
    implementation(libs.google.play.services.ads)

    // Google Sign-in & Credentials
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.auth)
    implementation(libs.googleid)

    // Google Play Billing
    implementation(libs.google.billing)

    // Google Play in-app updates
    implementation(libs.google.play.app.update)
    implementation(libs.google.play.app.update.ktx)

    testImplementation(libs.junit)
    testImplementation(libs.mockito.core)
    testImplementation(libs.mockito.kotlin)
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")

    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
