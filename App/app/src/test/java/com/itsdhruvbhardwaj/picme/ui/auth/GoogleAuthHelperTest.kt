package com.itsdhruvbhardwaj.picme.ui.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.NoCredentialException
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test
import org.mockito.kotlin.*

@OptIn(ExperimentalCoroutinesApi::class)
class GoogleAuthHelperTest {
    private val context = mock<Context>()
    private val manager = mock<CredentialManager>()
    private val errors = mutableListOf<String>()
    private val events = mutableListOf<String>()
    private fun helper() = GoogleAuthHelper(context, manager, events::add)

    @Test fun `failed credential attempt releases guard and permits a new attempt`() = runTest {
        whenever(manager.getCredential(eq(context), any<androidx.credentials.GetCredentialRequest>())).doSuspendableAnswer {
            throw NoCredentialException("private provider details")
        }
        val helper = helper()
        helper.signIn(this, { fail("Unexpected token") }, errors::add)
        assertTrue(helper.isSigningIn.value)
        runCurrent()
        assertFalse(helper.isSigningIn.value)
        assertTrue(errors.single().contains("Google account"))
        assertFalse(errors.single().contains("private provider details"))
        helper.signIn(this, {}, errors::add)
        runCurrent()
        verify(manager, times(2)).getCredential(eq(context), any<androidx.credentials.GetCredentialRequest>())
    }

    @Test fun `rapid taps open only one explicit Google button request`() = runTest {
        val response = CompletableDeferred<GetCredentialResponse>()
        whenever(manager.getCredential(eq(context), any<androidx.credentials.GetCredentialRequest>())).doSuspendableAnswer { response.await() }
        val helper = helper()
        helper.signIn(this, {}, errors::add)
        helper.signIn(this, {}, errors::add)
        runCurrent()
        val request = argumentCaptor<androidx.credentials.GetCredentialRequest>()
        verify(manager).getCredential(eq(context), request.capture())
        assertEquals(1, request.firstValue.credentialOptions.size)
        assertTrue(request.firstValue.credentialOptions.single() is com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption)
        response.completeExceptionally(GetCredentialCancellationException())
        runCurrent()
        assertTrue(errors.isEmpty())
        assertFalse(helper.isSigningIn.value)
    }

    @Test fun `slow provider times out and can be retried without reinstalling`() = runTest {
        whenever(manager.getCredential(eq(context), any<androidx.credentials.GetCredentialRequest>())).doSuspendableAnswer { awaitCancellation() }
        val helper = helper()
        helper.signIn(this, {}, errors::add)
        advanceUntilIdle()
        assertFalse(helper.isSigningIn.value)
        assertTrue(errors.single().contains("too long"))
    }

    @Test fun `cancelled screen does not show an error or leave sign in locked`() = runTest {
        val scope = CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
        val helper = helper()
        helper.signIn(scope, {}, errors::add)
        scope.cancel()
        runCurrent()
        assertFalse(helper.isSigningIn.value)
        assertTrue(errors.isEmpty())
    }

    @Test fun `Google verification and network errors give relevant safe recovery messages`() {
        assertFalse(GoogleSignInErrors.backendMessage("google_authentication_failed").contains("deletion"))
        assertTrue(GoogleSignInErrors.backendMessage("network_failure").contains("connection"))
        assertTrue(GoogleSignInErrors.backendMessage("rate_limited").contains("wait"))
        assertFalse(GoogleSignInErrors.backendMessage("raw secret server text").contains("secret"))
    }
}
