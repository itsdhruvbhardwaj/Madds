package com.itsdhruvbhardwaj.picme.ui.screens.home

import com.itsdhruvbhardwaj.picme.data.model.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.Assert.*

@OptIn(ExperimentalCoroutinesApi::class)
class DailyRewardViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    private var clock = 0L
    private val offer = DailyRewardStatus(true, true, true, false, 2, 1, "2026-11-16", 1000, 11000)
    @Before fun setup() { Dispatchers.setMain(dispatcher) }
    @After fun cleanup() { Dispatchers.resetMain() }
    private fun model(load: suspend (String) -> Result<DailyRewardStatus> = { Result.success(offer) },
                      claim: suspend (String, DailyRewardClaimRequest) -> Result<DailyRewardClaimResponse> = { _, _ -> Result.success(DailyRewardClaimResponse(true, "claimed", true, 2, 12, offer.dayKey, 1000, 11000)) }) =
        DailyRewardViewModel(load, claim) { clock }.also { it.bindAccount("owner"); it.beginVisit() }
    private fun tick(model: DailyRewardViewModel, safe: Boolean = true) { model.checkVisit(safe); dispatcher.scheduler.runCurrent(); model.checkVisit(safe); dispatcher.scheduler.runCurrent() }

    @Test fun `dismissal suppresses only this visit and reopening checks again`() = runTest(dispatcher) {
        var loads = 0; val vm = model(load = { loads++; Result.success(offer) })
        tick(vm); assertTrue(vm.state.value.popup); vm.dismiss(); tick(vm)
        assertFalse(vm.state.value.popup); assertTrue(vm.state.value.available); assertEquals(1, loads)
        vm.beginVisit(); tick(vm); assertFalse(vm.state.value.popup) // Configuration changes are not new visits.
        vm.endVisit(); vm.beginVisit(); tick(vm); assertTrue(vm.state.value.popup); assertEquals(2, loads)
    }
    @Test fun `reminder tap rechecks the server and can reopen a dismissed claim in the same visit`() = runTest(dispatcher) {
        var response = offer; var loads = 0
        val vm = model(load = { loads++; Result.success(response) })
        tick(vm); vm.dismiss(); assertFalse(vm.state.value.popup)
        vm.reminderOpened(); tick(vm); assertTrue(vm.state.value.popup); assertEquals(2, loads)
        response = offer.copy(claimed = true, eligible = false)
        vm.reminderOpened(); tick(vm); assertFalse(vm.state.value.popup); assertFalse(vm.state.value.available)
    }
    @Test fun `claim confirmation removes popup and strip and repeat taps cannot overlap`() = runTest(dispatcher) {
        var calls = 0; val pending = CompletableDeferred<Result<DailyRewardClaimResponse>>()
        val vm = model(claim = { _, _ -> calls++; pending.await() }); tick(vm)
        vm.claimBonus(); vm.claimBonus(); runCurrent(); assertEquals(1, calls); assertTrue(vm.state.value.claiming)
        pending.complete(Result.success(DailyRewardClaimResponse(true, "claimed", true, 2, 12, offer.dayKey, 1000, 11000))); runCurrent()
        assertFalse(vm.state.value.available); assertFalse(vm.state.value.popup); assertFalse(vm.state.value.claiming)
        vm.claimBonus(); runCurrent(); assertEquals(1, calls)
    }
    @Test fun `only a newly confirmed claim emits one post claim event after the UI unlocks`() = runTest(dispatcher) {
        val vm = model(); val events = mutableListOf<DailyRewardClaimed>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) {
            vm.claimCompletions.collect { event ->
                assertFalse(vm.state.value.claiming); assertFalse(vm.state.value.popup); events += event
            }
        }
        tick(vm); vm.claimBonus(); vm.claimBonus(); runCurrent(); vm.claimBonus(); runCurrent()
        assertEquals(listOf(DailyRewardClaimed("owner", offer.dayKey, clock)), events)
    }
    @Test fun `already claimed receipts and lost response reconciliation never emit an ad event`() = runTest(dispatcher) {
        for (reconcile in listOf(false, true)) {
            var loads = 0
            val vm = model(load = { Result.success(if (++loads == 1) offer else offer.copy(claimed = true, eligible = false)) },
                claim = { _, _ -> if (reconcile) Result.failure(Exception("timeout")) else Result.success(DailyRewardClaimResponse(true, "already_claimed", true, 2, 12, offer.dayKey, 1000, 11000)) })
            val events = mutableListOf<DailyRewardClaimed>()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.claimCompletions.collect { events += it } }
            tick(vm); vm.claimBonus(); runCurrent()
            assertTrue(events.isEmpty()); assertFalse(vm.state.value.available)
        }
    }
    @Test fun `completed claim events do not replay for a resumed screen or a new account`() = runTest(dispatcher) {
        val vm = model(); tick(vm); vm.claimBonus(); runCurrent()
        val events = mutableListOf<DailyRewardClaimed>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.claimCompletions.collect { events += it } }
        vm.bindAccount("other"); vm.beginVisit(); runCurrent(); assertTrue(events.isEmpty())
    }
    @Test fun `failed claims and account switches during a claim do not emit an ad event`() = runTest(dispatcher) {
        val pending = CompletableDeferred<Result<DailyRewardClaimResponse>>()
        val vm = model(claim = { _, _ -> pending.await() })
        val events = mutableListOf<DailyRewardClaimed>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.claimCompletions.collect { events += it } }
        tick(vm); vm.claimBonus(); runCurrent(); vm.bindAccount("other")
        pending.complete(Result.success(DailyRewardClaimResponse(true, "claimed", true, 2, 12, offer.dayKey, 1000, 11000)))
        runCurrent(); assertTrue(events.isEmpty())
        val failed = model(claim = { _, _ -> Result.failure(Exception("offline")) })
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { failed.claimCompletions.collect { events += it } }
        tick(failed); failed.claimBonus(); runCurrent(); assertTrue(events.isEmpty()); assertNotNull(failed.state.value.error)
    }
    @Test fun `a claim from another device hides both on the next visit`() = runTest(dispatcher) {
        var response = offer; val vm = model(load = { Result.success(response) }); tick(vm); vm.dismiss()
        response = offer.copy(claimed = true, eligible = false); vm.endVisit(); vm.beginVisit(); tick(vm)
        assertFalse(vm.state.value.popup); assertFalse(vm.state.value.available)
    }
    @Test fun `lost claim response reconciles confirmed receipt without adding credits locally`() = runTest(dispatcher) {
        var loads = 0
        val vm = model(load = { Result.success(if (++loads == 1) offer else offer.copy(claimed = true, eligible = false)) }, claim = { _, _ -> Result.failure(Exception("timeout")) })
        tick(vm); vm.claimBonus(); runCurrent()
        assertFalse(vm.state.value.available); assertFalse(vm.state.value.popup); assertNull(vm.state.value.error)
    }
    @Test fun `changed offer is reviewed and the next claim sends its new revision`() = runTest(dispatcher) {
        var loads = 0; val requests = mutableListOf<DailyRewardClaimRequest>()
        val vm = model(load = { Result.success(if (++loads == 1) offer else offer.copy(credits = 5, revision = 2)) }, claim = { _, req -> requests += req; Result.failure(Exception("changed")) })
        tick(vm); vm.claimBonus(); runCurrent()
        assertEquals(5, vm.state.value.offer?.credits); assertNotNull(vm.state.value.error)
        vm.claimBonus(); runCurrent(); assertEquals(listOf(1, 2), requests.map { it.revision })
    }
    @Test fun `server reset uses elapsed time and a new day can prompt in the same visit`() = runTest(dispatcher) {
        var response = offer; val vm = model(load = { Result.success(response) }); tick(vm); vm.dismiss()
        clock = 10001; response = offer.copy(dayKey = "2026-11-17"); tick(vm)
        assertTrue(vm.state.value.popup); assertEquals("2026-11-17", vm.state.value.offer?.dayKey)
    }
    @Test fun `disabled and already claimed offers never show a popup or strip`() = runTest(dispatcher) {
        for (response in listOf(offer.copy(enabled = false, eligible = false), offer.copy(claimed = true, eligible = false))) {
            val vm = model(load = { Result.success(response) }); tick(vm)
            assertFalse(vm.state.value.popup); assertFalse(vm.state.value.available)
        }
    }
    @Test fun `unsafe screens defer the popup until home is quiet`() = runTest(dispatcher) {
        val vm = model(); tick(vm, false); assertFalse(vm.state.value.popup)
        tick(vm, true); assertTrue(vm.state.value.popup)
    }
    @Test fun `account changes discard a pending previous-account response`() = runTest(dispatcher) {
        val pending = CompletableDeferred<Result<DailyRewardStatus>>()
        val vm = model(load = { if (it == "owner") pending.await() else Result.success(offer.copy(claimed = true, eligible = false)) })
        vm.checkVisit(true); runCurrent(); vm.bindAccount("new-owner"); tick(vm)
        pending.complete(Result.success(offer)); runCurrent()
        assertFalse(vm.state.value.available); assertFalse(vm.state.value.popup)
        vm.bindAccount(null); assertNull(vm.state.value.offer)
    }
    @Test fun `failed eligibility checks retry with bounds and recover on a new visit`() = runTest(dispatcher) {
        var calls = 0; val vm = model(load = { calls++; Result.failure(Exception("offline")) })
        tick(vm); tick(vm); assertEquals(1, calls)
        for (step in 1..6) { clock += 40000; tick(vm) }
        assertEquals(4, calls); assertFalse(vm.state.value.available)
        vm.endVisit(); vm.beginVisit(); tick(vm); assertEquals(5, calls)
    }
}
