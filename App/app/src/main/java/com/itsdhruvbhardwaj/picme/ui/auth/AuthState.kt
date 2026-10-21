package com.itsdhruvbhardwaj.picme.ui.auth

import com.itsdhruvbhardwaj.picme.data.model.User

/**
 * Represents the various states of the PicMe authentication flow.
 */
sealed interface AuthState {
    /**
     * The app is currently checking for an existing session (restoring).
     */
    data object CheckingSession : AuthState

    /**
     * The app has valid tokens and is restoring the user profile in the background.
     * Allows the Home screen to show its skeleton state.
     */
    data object RestoringSession : AuthState

    /**
     * The user is not logged in.
     */
    data object Unauthenticated : AuthState

    /**
     * An authentication operation (login/Google/Signup/Verify) is currently in progress.
     */
    data object Authenticating : AuthState

    /**
     * The user has been successfully authenticated.
     * @property user The profile data of the logged-in user.
     */
    data class Authenticated(val user: User) : AuthState

    /**
     * Registration was successful, but the user needs to verify their email.
     * @property email The email address that needs verification.
     */
    data class VerifyEmailRequired(val email: String) : AuthState

    /**
     * Email verification was successful. The user should now log in.
     * @property message Success message from the server.
     */
    data class VerificationSuccess(val message: String) : AuthState

    /**
     * Registration failed because the email already exists.
     */
    data object EmailAlreadyExists : AuthState

    /**
     * Session restoration failed due to a network error.
     */
    data object SessionCheckNetworkError : AuthState
    
    /**
     * Password reset email was sent successfully.
     * @property message Success message from the server.
     */
    data class PasswordResetSent(val message: String) : AuthState

    /**
     * Password was reset successfully.
     * @property message Success message from the server.
     */
    data class PasswordResetSuccess(val message: String) : AuthState

    /**
     * Login failed because the account is scheduled for deletion.
     * @property scheduledDate The date when the account will be permanently deleted.
     */
    data class DeletionPending(val scheduledDate: String?) : AuthState

    /**
     * An authentication operation failed.
     * @property message A human-readable description of the failure.
     */
    data class Error(val message: String) : AuthState
}
