# Investigating generation failures

Studio → Users → View → Generations now includes a Diagnostics column. For new
requests it shows a safe failure category, HTTP status, provider/model, provider
reference when returned, provider duration, failure stage/time and refund time
when committed. Recovery separately reports result retrieval, acknowledgement,
provider completion and expiry. Acknowledging an error is not opening an image.

For older failures, the generic stored failure code is explained; the original
provider error cannot be reconstructed. Raw prompts, uploaded photos, credentials,
provider messages and complete provider response bodies are not stored in these
diagnostics. Restricted administrator access remains required.

Match the generation reference and time with the provider record. A 429 is a
rate/capacity rejection; 401/403 indicates provider authorization/access; 402 is
provider account balance; policy rejection has its own reason category. Timeout,
5xx, empty image and recovery-storage failure require outcome verification.
No automatic paid provider retry or new refund rule is introduced. Confirmed
rejections retain the existing transactional refund; unknown outcomes retain the
reservation until investigated. Older failed records without refund timestamps
must be checked against credit history.

Interrupted processing is classified as uncertain after the greater of five
minutes or the configured provider timeout plus two minutes, by the recovery
endpoint or notification processor. It is not declared a confirmed paid failure.

Android now cancels obsolete progress alerts and uses an absolute processing
deadline. Download/save notifications and their old channel are removed; save
toasts and generation/photo-ready notifications remain. Closing an uncertain
error acknowledges the reminder without retrying or refunding. A completed photo
whose retrieval failed remains recoverable. Saved pending keys older than five
minutes are removed only after the server explicitly returns 404; temporary API
failures do not erase request identity.

Backend and Studio must be deployed for new diagnostics; Android users need an
app update for notification cleanup and client recovery changes. No broadcast,
paid generation, production data mutation or deployment was used for validation.
