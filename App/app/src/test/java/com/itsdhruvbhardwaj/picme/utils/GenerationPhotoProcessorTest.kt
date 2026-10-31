package com.itsdhruvbhardwaj.picme.utils

import org.junit.Assert.assertEquals
import org.junit.Test

class GenerationPhotoProcessorTest {
    @Test fun `large portraits keep their aspect ratio`() {
        assertEquals(768 to 1024, GenerationPhotoProcessor.targetSize(3000, 4000))
    }
    @Test fun `landscapes are limited on their longest edge`() {
        assertEquals(1024 to 576, GenerationPhotoProcessor.targetSize(3840, 2160))
    }
    @Test fun `small photos are never enlarged`() {
        assertEquals(480 to 640, GenerationPhotoProcessor.targetSize(480, 640))
    }
    @Test fun `panoramas retain a nonzero short edge`() {
        assertEquals(1024 to 1, GenerationPhotoProcessor.targetSize(50000, 1))
    }
    @Test(expected = IllegalArgumentException::class) fun `invalid dimensions fail before uploading`() {
        GenerationPhotoProcessor.targetSize(0, 100)
    }
}
