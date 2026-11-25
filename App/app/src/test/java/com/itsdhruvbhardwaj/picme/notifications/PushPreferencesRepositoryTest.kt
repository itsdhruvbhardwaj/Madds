package com.itsdhruvbhardwaj.picme.notifications

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson
import com.google.gson.JsonParser
import com.itsdhruvbhardwaj.picme.data.local.AuthTokenStorage
import com.itsdhruvbhardwaj.picme.data.model.User
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.*
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

/** Real Retrofit/Gson requests intercepted locally; no Firebase or remote user is contacted. */
class PushPreferencesRepositoryTest {
    private val data = mutableMapOf<String, Any?>()
    private val prefs = mock<SharedPreferences>()
    private val editor = mock<SharedPreferences.Editor>()
    private val context = mock<Context>()
    private val storage = mock<AuthTokenStorage>()
    private val auth = mock<AuthRepository>()
    private val calls = mutableListOf<String>()
    private val receipts = mutableSetOf<String>()
    private var server = PushCategory.entries.associate { it.key to false }
    private var grantFailure = false
    private var lostGrantResponse = false
    private var changeAccountOnGrant = false
    private lateinit var retrofit: Retrofit
    private lateinit var local: PushLocalState
    private fun repository() = PushPreferencesRepository(context, retrofit, storage, auth) { false }

    @Before fun before() {
        whenever(context.applicationContext).thenReturn(context)
        whenever(context.getSharedPreferences(any(), any())).thenReturn(prefs)
        whenever(prefs.edit()).thenReturn(editor)
        whenever(prefs.contains(any())).thenAnswer { data.containsKey(it.getArgument<String>(0)) }
        whenever(prefs.getString(any(), anyOrNull())).thenAnswer { data[it.getArgument<String>(0)] as? String ?: it.getArgument<String?>(1) }
        whenever(prefs.getBoolean(any(), any())).thenAnswer { data[it.getArgument<String>(0)] as? Boolean ?: it.getArgument<Boolean>(1) }
        whenever(prefs.getStringSet(any(), anyOrNull())).thenAnswer { (data[it.getArgument<String>(0)] as? Set<*>)?.map { key -> key.toString() }?.toSet() ?: emptySet<String>() }
        whenever(editor.putString(any(), anyOrNull())).thenAnswer { data[it.getArgument(0)] = it.getArgument<String?>(1); editor }
        whenever(editor.putBoolean(any(), any())).thenAnswer { data[it.getArgument(0)] = it.getArgument<Boolean>(1); editor }
        whenever(editor.putStringSet(any(), anyOrNull())).thenAnswer { data[it.getArgument(0)] = it.getArgument<Set<String>?>(1)?.toSet(); editor }
        whenever(editor.remove(any())).thenAnswer { data.remove(it.getArgument<String>(0)); editor }
        whenever(editor.commit()).thenReturn(true)
        whenever(storage.getAccessToken()).thenReturn(access())
        whenever(storage.getUser()).thenReturn(User(USER_A, "Tester", "test@example.com", true))
        local = PushLocalState(context) { false }
        val client = OkHttpClient.Builder().addInterceptor { chain ->
            val request = chain.request()
            val path = request.url.encodedPath.substringAfter("/api/notifications/")
            calls.add("${request.method} $path")
            val json = request.body?.let { body -> Buffer().also { body.writeTo(it) }.readUtf8() }
            var code = 200
            if (path == "preferences/permission-grant") {
                if (grantFailure) code = 503
                else {
                    val id = JsonParser.parseString(json).asJsonObject["installationId"].asString
                    if (receipts.add(id)) server = PushCategory.entries.associate { it.key to true }
                    if (lostGrantResponse) { lostGrantResponse = false; code = 503 }
                    if (changeAccountOnGrant) {
                        whenever(storage.getAccessToken()).thenReturn(access(USER_B))
                        whenever(storage.getUser()).thenReturn(User(USER_B, "Other", "other@example.com", true))
                    }
                }
            } else if (request.method == "PATCH") {
                server = server + JsonParser.parseString(json).asJsonObject.entrySet().associate { it.key to it.value.asBoolean }
            }
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(code).message("Test")
                .body(Gson().toJson(mapOf("preferences" to server)).toResponseBody("application/json".toMediaType())).build()
        }.build()
        retrofit = Retrofit.Builder().baseUrl("https://local.test/").client(client).addConverterFactory(GsonConverterFactory.create()).build()
    }

    @Test fun `Allow persists all categories before any Firebase token is available`() = runBlocking {
        local.recordPermissionGrant(USER_A)
        val repository = repository()
        assertTrue(PushDeviceSync(context, retrofit, storage, auth, repository).syncOnce(USER_A, null))
        assertTrue(PushCategory.entries.all { repository.cached(USER_A)[it.key] == true })
        assertEquals(listOf("POST preferences/permission-grant", "GET preferences"), calls)
        assertNull(local.pendingPermissionGrant(USER_A))
    }

    @Test fun `failed Allow survives repository recreation and retries`() = runBlocking {
        local.recordPermissionGrant(USER_A); grantFailure = true
        assertTrue(repository().load(USER_A).isFailure)
        val pending = local.pendingPermissionGrant(USER_A)
        assertNotNull(pending)
        grantFailure = false
        assertTrue(repository().load(USER_A).isSuccess)
        assertEquals(setOf(pending), receipts)
        assertNull(local.pendingPermissionGrant(USER_A))
    }

    @Test fun `pre-login Allow waits for authentication`() = runBlocking {
        local.recordPermissionGrant()
        whenever(storage.getAccessToken()).thenReturn(null)
        whenever(storage.getUser()).thenReturn(null)
        assertTrue(repository().load(USER_A).isFailure)
        assertTrue(calls.isEmpty())
        whenever(storage.getAccessToken()).thenReturn(access())
        whenever(storage.getUser()).thenReturn(User(USER_A, "Tester", "test@example.com", true))
        assertTrue(repository().load(USER_A).isSuccess)
        assertTrue(server.values.all { it })
    }

    @Test fun `later opt outs survive refresh and repeated Allow callback`() = runBlocking {
        local.recordPermissionGrant(USER_A)
        val repository = repository(); assertTrue(repository.load(USER_A).isSuccess)
        assertTrue(repository.set(USER_A, PushCategory.OFFERS, false).isSuccess)
        assertFalse(local.recordPermissionGrant(USER_A))
        assertTrue(repository.load(USER_A).isSuccess)
        assertEquals(false, server["offers"])
        assertEquals(false, repository.cached(USER_A)["offers"])
        assertEquals(1, calls.count { it == "POST preferences/permission-grant" })
    }

    @Test fun `lost Allow response is retried before applying a later opt out`() = runBlocking {
        local.recordPermissionGrant(USER_A); lostGrantResponse = true
        val repository = repository(); assertTrue(repository.load(USER_A).isFailure)
        assertTrue(server.values.all { it })
        assertTrue(repository.set(USER_A, PushCategory.OFFERS, false).isSuccess)
        assertEquals(false, server["offers"])
        assertEquals(1, receipts.size)
        assertEquals(2, calls.count { it == "POST preferences/permission-grant" })
        assertTrue(repository.load(USER_A).isSuccess)
        assertEquals(false, repository.cached(USER_A)["offers"])
    }

    @Test fun `permission already granted without an Allow event never resets choices`() = runBlocking {
        assertTrue(PushPreferencesRepository(context, retrofit, storage, auth) { true }.load(USER_A).isSuccess)
        assertEquals(listOf("POST preferences/initialize"), calls)
        assertTrue(server.values.none { it })
    }

    @Test fun `account change during Allow does not populate another accounts preferences`() = runBlocking {
        local.recordPermissionGrant(USER_A); changeAccountOnGrant = true
        val repository = repository()
        assertTrue(repository.load(USER_A).isFailure)
        assertTrue(repository.cached(USER_B).isEmpty())
        assertNull(local.pendingPermissionGrant(USER_B))
        assertNotNull(local.pendingPermissionGrant(USER_A))
        assertEquals(listOf("POST preferences/permission-grant"), calls)
    }
}
