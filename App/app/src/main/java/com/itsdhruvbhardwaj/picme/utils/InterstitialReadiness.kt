package com.itsdhruvbhardwaj.picme.utils

enum class InterstitialFailure { NETWORK, NO_FILL, INVALID_REQUEST, INTERNAL, TIMEOUT }

/** Monotonic-clock state, independent of Android and the SDK for deterministic tests. */
class InterstitialReadiness {
    companion object {
        const val CACHE_TTL_MS=55*60_000L
        const val LOAD_TIMEOUT_MS=60_000L
    }
    private var sequence=0L
    var activeRequest:Long?=null;private set
    var startedAt=0L;private set
    var loadedAt:Long?=null;private set
    var retryAt=0L;private set
    var failure:InterstitialFailure?=null;private set
    private var consecutiveFailures=0
    fun ready(now:Long)=loadedAt?.let { now-it in 0 until CACHE_TTL_MS }==true
    fun expire(now:Long):Boolean {
        if(loadedAt!=null&&!ready(now)){loadedAt=null;return true}
        return false
    }
    fun begin(now:Long):Long? {
        expire(now)
        if(activeRequest!=null||ready(now)||now<retryAt)return null
        activeRequest=++sequence;startedAt=now;return activeRequest
    }
    fun loaded(ticket:Long,now:Long):Boolean {
        if(activeRequest!=ticket)return false
        activeRequest=null;loadedAt=now;retryAt=0;consecutiveFailures=0;failure=null;return true
    }
    fun failed(ticket:Long,now:Long,kind:InterstitialFailure):Boolean {
        if(activeRequest!=ticket)return false
        activeRequest=null;loadedAt=null;failure=kind
        consecutiveFailures=(consecutiveFailures+1).coerceAtMost(6)
        val multiplier=1L shl (consecutiveFailures-1)
        val wait=when(kind){
            InterstitialFailure.NETWORK -> (10_000L*multiplier).coerceAtMost(120_000)
            InterstitialFailure.NO_FILL -> (30_000L*multiplier).coerceAtMost(300_000)
            InterstitialFailure.INVALID_REQUEST -> 300_000L
            InterstitialFailure.INTERNAL,InterstitialFailure.TIMEOUT -> (30_000L*multiplier).coerceAtMost(300_000)
        }
        retryAt=now+wait;return true
    }
    fun timeout(now:Long):Boolean {
        val ticket=activeRequest?:return false
        return now-startedAt>=LOAD_TIMEOUT_MS && failed(ticket,now,InterstitialFailure.TIMEOUT)
    }
    fun connectivityRestored(now:Long){if(failure==InterstitialFailure.NETWORK)retryAt=now}
    fun showFailed(now:Long){retryAt=maxOf(retryAt,now+30_000);failure=InterstitialFailure.INTERNAL}
    fun consume(){loadedAt=null}
    fun clear(){activeRequest=null;loadedAt=null;retryAt=0;failure=null;consecutiveFailures=0;sequence++}
}

data class InterstitialDiagnosticEvent(val timeMs:Long,val event:String,val detail:String)
data class InterstitialDiagnostics(
    val readiness:String="Waiting for SDK",val lastFailure:String?=null,
    val retryAtUptime:Long=0,val cachedAtUptime:Long?=null,
    val usageRemainingSeconds:Long?=null,val timerPausedReason:String?=null,
    val events:List<InterstitialDiagnosticEvent> = emptyList()
)
