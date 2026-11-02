package com.itsdhruvbhardwaj.picme.notifications

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.Assert.*
import org.mockito.kotlin.*

@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class NotificationPreferencesViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private val repository = mock<PushPreferencesRepository>()
    @Before fun before() { Dispatchers.setMain(dispatcher); whenever(repository.cached(any())).thenReturn(emptyMap()) }
    @After fun after() { Dispatchers.resetMain() }
    @Test fun `failed enable does not appear enabled`() = runTest(dispatcher) {
        whenever(repository.load(USER_A)).thenReturn(Result.success(emptyMap()))
        whenever(repository.set(USER_A, PushCategory.UPDATES, true)).thenReturn(Result.failure(Exception("Offline")))
        val vm = NotificationPreferencesViewModel(repository); vm.load(USER_A); advanceUntilIdle()
        vm.set(USER_A, PushCategory.UPDATES, true); advanceUntilIdle()
        assertNotEquals(true, vm.state.value.preferences["productUpdates"]); assertEquals("Offline", vm.state.value.error)
    }
    @Test fun `failed disable preserves the immediate local opt out`() = runTest(dispatcher) {
        whenever(repository.load(USER_A)).thenReturn(Result.success(mapOf("productUpdates" to true)))
        whenever(repository.set(USER_A, PushCategory.UPDATES, false)).thenReturn(Result.failure(Exception("Offline")))
        whenever(repository.cached(USER_A)).thenReturn(mapOf("productUpdates" to false))
        val vm = NotificationPreferencesViewModel(repository); vm.load(USER_A); advanceUntilIdle()
        vm.set(USER_A, PushCategory.UPDATES, false)
        assertEquals(false, vm.state.value.preferences["productUpdates"])
        advanceUntilIdle(); assertEquals(false, vm.state.value.preferences["productUpdates"])
    }
    @Test fun `account switch cancels an old preference load`() = runTest(dispatcher) {
        whenever(repository.load(USER_A)).thenAnswer { null }
        whenever(repository.load(USER_B)).thenReturn(Result.success(mapOf("offers" to true)))
        val vm = NotificationPreferencesViewModel(repository)
        vm.load(USER_A); vm.load(USER_B); advanceUntilIdle()
        assertEquals(USER_B, vm.state.value.userId); assertEquals(true, vm.state.value.preferences["offers"])
    }
    @Test fun `saving one category preserves all rows and other pending choices`() = runTest(dispatcher) {
        val first = CompletableDeferred<Result<Map<String, Boolean>>>()
        val second = CompletableDeferred<Result<Map<String, Boolean>>>()
        val initial = PushCategory.entries.associate { it.key to true }
        whenever(repository.load(USER_A)).thenReturn(Result.success(initial))
        whenever(repository.set(USER_A, PushCategory.UPDATES, false)).doSuspendableAnswer { first.await() }
        whenever(repository.set(USER_A, PushCategory.OFFERS, false)).doSuspendableAnswer { second.await() }
        val vm = NotificationPreferencesViewModel(repository); vm.load(USER_A); runCurrent()
        vm.set(USER_A, PushCategory.UPDATES, false); vm.set(USER_A, PushCategory.OFFERS, false); runCurrent()
        assertEquals(4, vm.state.value.preferences.size)
        assertEquals(setOf("productUpdates", "offers"), vm.state.value.savingCategories)
        assertEquals(true, vm.state.value.preferences["newStyles"])
        first.complete(Result.success(initial + ("productUpdates" to false))); runCurrent()
        assertEquals(false, vm.state.value.preferences["offers"])
        assertEquals(setOf("offers"), vm.state.value.savingCategories)
        second.complete(Result.success(initial + mapOf("productUpdates" to false, "offers" to false))); runCurrent()
        assertFalse(vm.state.value.saving)
    }
    @Test fun `failed save cannot clear unrelated preferences even with an empty cache`() = runTest(dispatcher) {
        whenever(repository.load(USER_A)).thenReturn(Result.success(PushCategory.entries.associate { it.key to true }))
        whenever(repository.set(USER_A, PushCategory.UPDATES, false)).thenReturn(Result.failure(Exception("Offline")))
        val vm = NotificationPreferencesViewModel(repository); vm.load(USER_A); runCurrent()
        vm.set(USER_A, PushCategory.UPDATES, false); runCurrent()
        assertEquals(false, vm.state.value.preferences["productUpdates"])
        assertEquals(true, vm.state.value.preferences["offers"])
        assertEquals(true, vm.state.value.preferences["newStyles"])
        assertEquals(true, vm.state.value.preferences["reengagement"])
    }
    @Test fun `refresh keeps visible choices while the network is loading`() = runTest(dispatcher) {
        val refresh = CompletableDeferred<Result<Map<String, Boolean>>>()
        whenever(repository.load(USER_A)).thenReturn(Result.success(mapOf("offers" to true)))
        val vm = NotificationPreferencesViewModel(repository); vm.load(USER_A); runCurrent()
        whenever(repository.load(USER_A)).doSuspendableAnswer { refresh.await() }
        vm.load(USER_A); runCurrent()
        assertTrue(vm.state.value.loading)
        assertEquals(true, vm.state.value.preferences["offers"])
        refresh.complete(Result.success(mapOf("offers" to true))); runCurrent()
    }
}
