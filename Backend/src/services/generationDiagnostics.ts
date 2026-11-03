import { env } from "../config/env.js";

export function diagnosticToken(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,120}$/.test(value) ? value : undefined;
}

// Never persist provider messages, prompts, image data, URLs or authorization.
// Only bounded references and known reason categories leave the provider adapter.
export function generationFailureDetails(error: unknown, stage = "provider") {
  const e = (error && typeof error === "object" ? error : {}) as Record<string, any>;
  const status = Number.isInteger(e.status) && e.status >= 100 && e.status <= 599 ? e.status as number : undefined;
  const type = String(e.name || "");
  const code = diagnosticToken(e.providerCode ?? e.code);
  let reason = "Provider outcome could not be confirmed. Review the provider record before retrying or refunding.";
  if (stage === "storage") reason = "The provider returned an image, but saving or finalizing its recovery copy failed.";
  else if (type === "AbortError" || type === "TimeoutError" || type.includes("Timeout")) reason = "The provider request timed out; its completion and billing outcome need verification.";
  else if (code === "EMPTY_IMAGE_RESPONSE") reason = "The provider response contained no usable image.";
  else if (e.reasonCategory === "content") reason = "The provider rejected the request under its content policy.";
  else if (status === 429) reason = "The provider rejected the request because of a rate or capacity limit.";
  else if (status === 401 || status === 403) reason = "The provider rejected authorization or access to the selected model.";
  else if (status === 402) reason = "The provider rejected the request because its account has insufficient balance.";
  else if (status && status >= 400 && status < 500 && status !== 408) reason = `The provider rejected the request (HTTP ${status}).`;
  else if (status && status >= 500) reason = `The provider returned a server error (HTTP ${status}); completion is unconfirmed.`;
  return { failureReason: reason, failureStage: stage, failureRecordedAt: new Date(),
    providerName: env.imageGenerationProvider,
    providerModel: env.imageGenerationProvider === "openrouter" ? env.openRouterImageModel : env.imageModel,
    providerHttpStatus: status, providerErrorCode: code,
    providerRequestId: diagnosticToken(e.providerRequestId ?? e.request_id),
    providerErrorType: diagnosticToken(e.name) || "Error" };
}

export function processingLimitMs() { return Math.max(5 * 60_000, env.openAiTimeoutMs + 2 * 60_000); }

export function failureExplanation(code?: string) {
  return ({ PROVIDER_REJECTED: "The provider rejected this request. Detailed diagnostics were not recorded by the older backend.",
    PROVIDER_OUTCOME_UNKNOWN: "The provider outcome is unconfirmed. Detailed diagnostics were not recorded by the older backend.",
    INTERRUPTED_REQUIRES_RECONCILIATION: "Processing exceeded its deadline or the backend was interrupted. Provider outcome needs verification.",
    GENERATION_FINALIZATION_PENDING: "The generated image could not be saved or finalized." } as Record<string, string>)[code || ""] || "No failure details were recorded for this older request.";
}
