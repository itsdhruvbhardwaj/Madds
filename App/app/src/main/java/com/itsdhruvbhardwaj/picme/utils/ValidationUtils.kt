package com.itsdhruvbhardwaj.picme.utils

object ValidationUtils {
    
    // Strict email regex matching backend: requires a dot in the domain part
    private val EMAIL_REGEX = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$".toRegex()
    
    /**
     * Validates email format using strict regex.
     * dhruv@gmail -> false
     * dhruv@gmail.com -> true
     */
    fun isValidEmail(email: String): Boolean {
        return email.isNotBlank() && EMAIL_REGEX.matches(email.trim())
    }

    /**
     * Validates password strength based on backend rules:
     * - At least 8 characters
     * - At least one uppercase letter
     * - At least one lowercase letter
     * - At least one number
     */
    fun isStrongPassword(password: String): Boolean {
        val requirements = checkPasswordRequirements(password)
        return requirements.hasMinLength && 
               requirements.hasUppercase && 
               requirements.hasLowercase && 
               requirements.hasDigit
    }
    
    /**
     * Data class to track individual password requirement status for UI checklist
     */
    data class PasswordRequirements(
        val hasMinLength: Boolean,
        val hasUppercase: Boolean,
        val hasLowercase: Boolean,
        val hasDigit: Boolean
    )

    fun checkPasswordRequirements(password: String): PasswordRequirements {
        return PasswordRequirements(
            hasMinLength = password.length >= 8,
            hasUppercase = password.any { it.isUpperCase() },
            hasLowercase = password.any { it.isLowerCase() },
            hasDigit = password.any { it.isDigit() }
        )
    }
}
