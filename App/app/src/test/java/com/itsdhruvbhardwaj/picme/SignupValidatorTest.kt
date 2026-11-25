package com.itsdhruvbhardwaj.picme

import com.itsdhruvbhardwaj.picme.utils.ValidationUtils
import org.junit.Assert.*
import org.junit.Test

class SignupValidatorTest {

    @Test
    fun `isValidEmail rejects email without TLD`() {
        assertFalse(ValidationUtils.isValidEmail("dhruv@gmail"))
    }

    @Test
    fun `isValidEmail accepts valid email formats`() {
        assertTrue(ValidationUtils.isValidEmail("dhruv@gmail.com"))
        assertTrue(ValidationUtils.isValidEmail("user@outlook.com"))
        assertTrue(ValidationUtils.isValidEmail("student@university.edu"))
    }

    @Test
    fun `isStrongPassword rejects weak passwords`() {
        assertFalse(ValidationUtils.isStrongPassword("Dhruv")) // Too short, no number
        assertFalse(ValidationUtils.isStrongPassword("abcdefg1")) // No uppercase
        assertFalse(ValidationUtils.isStrongPassword("ABCDEFG1")) // No lowercase
        assertFalse(ValidationUtils.isStrongPassword("Abcdefgh")) // No number
    }

    @Test
    fun `isStrongPassword accepts strong passwords`() {
        assertTrue(ValidationUtils.isStrongPassword("Abcdefg1"))
    }
}
