package com.itsdhruvbhardwaj.picme.ui.auth

import com.itsdhruvbhardwaj.picme.data.model.User
import com.itsdhruvbhardwaj.picme.data.repository.AuthRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.*

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsPasswordManagementTest {
    private val dispatcher = StandardTestDispatcher()
    private val repository = mock<AuthRepository>()
    private val googleUser = User("user-a", "Tester", "test@example.com", true, hasGoogleLogin = true)
    @Before fun before() { Dispatchers.setMain(dispatcher) }
    @After fun after() { Dispatchers.resetMain() }
    private suspend fun model(user: User): AuthViewModel {
        whenever(repository.getCachedUser()).thenReturn(user)
        whenever(repository.getCurrentUser()).thenReturn(Result.success(user))
        return AuthViewModel(repository)
    }

    @Test fun `Google account without a password cannot reset or delete`() = runTest(dispatcher) {
        val model = model(googleUser)
        advanceUntilIdle()
        model.requestSettingsPasswordReset()
        model.deleteAccount("anything")
        advanceUntilIdle()
        assertTrue(model.passwordResetEmailState.value is PasswordResetEmailState.PasswordRequired)
        assertEquals(AuthState.Authenticated(googleUser), model.authState.value)
        verify(repository, never()).forgotPassword(any())
        verify(repository, never()).deleteAccount(any())
    }

    @Test fun `reset email uses the account email and keeps user signed in`() = runTest(dispatcher) {
        val user = googleUser.copy(hasPassword = true)
        val model = model(user)
        advanceUntilIdle()
        whenever(repository.forgotPassword(user.email)).thenReturn(Result.success("Check your inbox"))
        model.requestSettingsPasswordReset()
        model.requestSettingsPasswordReset()
        advanceUntilIdle()
        verify(repository, times(1)).forgotPassword(user.email)
        assertTrue(model.passwordResetEmailState.value is PasswordResetEmailState.Sent)
        assertEquals(AuthState.Authenticated(user), model.authState.value)
    }

    @Test fun `reset email failure keeps the authenticated account`() = runTest(dispatcher) {
        val user = googleUser.copy(hasPassword = true, hasGoogleLogin = false)
        val model = model(user)
        advanceUntilIdle()
        whenever(repository.forgotPassword(user.email)).thenReturn(Result.failure(Exception("network_failure")))
        model.requestSettingsPasswordReset()
        advanceUntilIdle()
        assertTrue(model.passwordResetEmailState.value is PasswordResetEmailState.Error)
        assertEquals(AuthState.Authenticated(user), model.authState.value)
    }

    @Test fun `password creation is unavailable once a password exists`() = runTest(dispatcher) {
        val model = model(googleUser.copy(hasPassword = true))
        advanceUntilIdle()
        model.requestGooglePasswordSetup("StrongPass1", "StrongPass1")
        advanceUntilIdle()
        verify(repository, never()).requestGooglePasswordSetup(any(), any())
    }

    @Test fun `password creation is unavailable for accounts without Google login`() = runTest(dispatcher) {
        val model = model(googleUser.copy(hasGoogleLogin = false))
        advanceUntilIdle()
        model.requestGooglePasswordSetup("StrongPass1", "StrongPass1")
        advanceUntilIdle()
        verify(repository, never()).requestGooglePasswordSetup(any(), any())
    }

    @Test fun `sending setup email does not activate a password or trigger deletion`() = runTest(dispatcher) {
        val model = model(googleUser)
        advanceUntilIdle()
        whenever(repository.requestGooglePasswordSetup(any(), any())).thenReturn(Result.success("Email sent"))
        model.requestGooglePasswordSetup("StrongPass1", "StrongPass1")
        model.requestGooglePasswordSetup("StrongPass1", "StrongPass1")
        advanceUntilIdle()
        assertTrue(model.passwordSetupState.value is PasswordSetupState.EmailSent)
        assertFalse((model.authState.value as AuthState.Authenticated).user.hasPassword)
        verify(repository, times(1)).requestGooglePasswordSetup("StrongPass1", "StrongPass1")
        verify(repository, never()).deleteAccount(any())
    }

    @Test fun `browser verification refreshes account flags without deleting the account`() = runTest(dispatcher) {
        val model = model(googleUser)
        advanceUntilIdle()
        whenever(repository.getCurrentUser()).thenReturn(Result.success(googleUser.copy(hasPassword = true)))
        model.refreshGooglePasswordSetupStatus()
        advanceUntilIdle()
        assertTrue(model.passwordSetupState.value is PasswordSetupState.Verified)
        assertTrue((model.authState.value as AuthState.Authenticated).user.hasPassword)
        verify(repository, never()).deleteAccount(any())
    }

    @Test fun `verification deep link consumes token once and refreshes the profile`() = runTest(dispatcher) {
        val model = model(googleUser)
        advanceUntilIdle()
        whenever(repository.verifyGooglePasswordSetup("token")).thenReturn(Result.success("Created"))
        whenever(repository.getCurrentUser()).thenReturn(Result.success(googleUser.copy(hasPassword = true)))
        model.verifyGooglePasswordSetup("token")
        advanceUntilIdle()
        model.verifyGooglePasswordSetup("token")
        advanceUntilIdle()
        assertTrue(model.passwordSetupState.value is PasswordSetupState.Verified)
        assertTrue((model.authState.value as AuthState.Authenticated).user.hasPassword)
        verify(repository, times(1)).verifyGooglePasswordSetup("token")
        verify(repository, never()).deleteAccount(any())
    }

    @Test fun `verification also completes when the app is signed out`() = runTest(dispatcher) {
        val model = model(googleUser)
        advanceUntilIdle()
        whenever(repository.logout()).thenReturn(Result.success(Unit))
        model.logout()
        advanceUntilIdle()
        whenever(repository.verifyGooglePasswordSetup("token")).thenReturn(Result.success("Created"))
        model.verifyGooglePasswordSetup("token")
        advanceUntilIdle()
        assertTrue(model.passwordSetupState.value is PasswordSetupState.Verified)
        assertTrue(model.authState.value is AuthState.Unauthenticated)
    }

    @Test fun `invalid reset link preserves the signed-in account`() = runTest(dispatcher) {
        val user = googleUser.copy(hasPassword = true)
        val model = model(user)
        advanceUntilIdle()
        whenever(repository.resetPassword(any(), any())).thenReturn(Result.failure(Exception("invalid_token")))
        val result = model.resetPassword("wrong-or-expired-link", "StrongPass1")
        assertTrue(result.isFailure)
        assertEquals(AuthState.Authenticated(user), model.authState.value)
        verify(repository, never()).logout()
    }

    @Test fun `reset network failure also preserves the signed-in account`() = runTest(dispatcher) {
        val user = googleUser.copy(hasPassword = true)
        val model = model(user)
        advanceUntilIdle()
        whenever(repository.resetPassword(any(), any())).thenReturn(Result.failure(Exception("network_failure")))
        assertTrue(model.resetPassword("token", "StrongPass1").isFailure)
        assertEquals(AuthState.Authenticated(user), model.authState.value)
    }

    @Test fun `confirmed reset success signs the user out`() = runTest(dispatcher) {
        val model = model(googleUser.copy(hasPassword = true))
        advanceUntilIdle()
        whenever(repository.resetPassword(any(), any())).thenReturn(Result.success("Password changed"))
        assertTrue(model.resetPassword("valid-token", "StrongPass1").isSuccess)
        assertTrue(model.authState.value is AuthState.Unauthenticated)
    }
}
