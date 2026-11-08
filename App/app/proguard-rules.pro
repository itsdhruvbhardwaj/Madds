# Gson reflects over API and cached-user models. Unannotated field names must
# remain stable in release builds, along with constructors and reflected fields.
-keep class com.itsdhruvbhardwaj.picme.data.model.** { *; }

# Preserve generic field types used by Gson for nested lists and models.
-keepattributes Signature
# Gson TypeToken subclasses need their generic supertype metadata in R8 full mode.
-keep,allowobfuscation class com.google.gson.reflect.TypeToken
-keep,allowobfuscation class * extends com.google.gson.reflect.TypeToken

# WorkManager 2.7 / Room 2.2 creates this generated database by reflection during
# AndroidX Startup, before MainActivity. The bundled rules keep the class name
# but R8 full mode can still remove its no-argument constructor.
-keep class androidx.work.impl.WorkDatabase_Impl {
    public <init>();
}

-keep class com.itsdhruvbhardwaj.picme.notifications.PushLocalState$Seen { *; }
-keep class com.itsdhruvbhardwaj.picme.notifications.PushPreferencesResponse { *; }
# Registration/detachment is serialized reflectively by Gson, outside data.model.
-keep class com.itsdhruvbhardwaj.picme.notifications.PushDeviceRequest { *; }
-keep class com.itsdhruvbhardwaj.picme.data.remote.StyleDetailsResponse { *; }
-keep class com.itsdhruvbhardwaj.picme.utils.WatermarkConfig { *; }
