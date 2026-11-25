import { diagnosticToken } from "./generationDiagnostics.js";

const object = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

/** Keep the explanation, not request bodies or echoed private inputs. */
export function sanitizeProviderText(value: unknown, privateTexts: string[] = [], limit = 600): string | undefined {
  if (typeof value !== "string") return undefined;
  // Redact before truncation so a long echoed prompt cannot leave a partial prefix.
  let text = value.slice(0, 65_536);
  text = text.replace(/data:[^\s,"'<>;]+(?:;[^,\s]*)?,[^\s"'<>]+/gi, "[image removed]")
    .replace(/("(?:prompt|input|input_references|authorization|api_key|access_token|refresh_token|image|b64_json)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[redacted]"');
  for (const original of privateTexts.filter(Boolean)) {
    const fragments = [original, ...original.split(/\n+|(?<=[.!?])\s+/).filter(part => part.length >= 24).slice(0, 32)];
    for (const part of fragments) {
      text = text.split(part).join("[redacted]");
      text = text.split(JSON.stringify(part).slice(1, -1)).join("[redacted]");
    }
  }
  text = text.replace(/\bBearer\s+[^\s,"'<>]+/gi, "Bearer [redacted]")
    .replace(/\bsk-[a-z0-9_-]+/gi, "[key removed]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[URL removed]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email removed]")
    .replace(/[A-Za-z0-9+/]{160,}={0,2}/g, "[encoded content removed]")
    .replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, limit) : undefined;
}

function reference(value: unknown, privateTexts: string[]) {
  const token = diagnosticToken(value);
  return token && !/^sk-/i.test(token) && !privateTexts.some(secret => secret && token.includes(secret)) ? token : undefined;
}

/** Extract only allowlisted fields; metadata.raw can itself be a JSON string. */
export function extractProviderError(body: unknown, privateTexts: string[] = []) {
  const root = object(body);
  const outer = object(root.error);
  const metadata = object(outer.metadata ?? root.metadata);
  let raw: unknown = metadata.raw;
  if (typeof raw === "string" && raw.length <= 65_536) {
    try { raw = JSON.parse(raw); } catch { /* Some providers return plain error text. */ }
  }
  const rawObject = object(raw);
  const upstream = object(rawObject.error ?? rawObject);
  const message = sanitizeProviderText(typeof root.error === "string" ? root.error : outer.message ?? root.message, privateTexts);
  const upstreamMessage = sanitizeProviderText(upstream.message ?? upstream.detail ?? (typeof raw === "string" ? raw : undefined), privateTexts);
  const code = outer.code ?? root.code;
  const param = upstream.param ?? outer.param;
  const categoryText = [message, upstreamMessage, upstream.code].filter(value => typeof value === "string").join(" ");
  return {
    providerErrorSanitized: true,
    providerCode: reference(typeof code === "number" ? String(code) : code, privateTexts),
    providerErrorMessage: message,
    providerUpstreamMessage: upstreamMessage,
    providerUpstreamCode: reference(typeof upstream.code === "number" ? String(upstream.code) : upstream.code, privateTexts),
    providerRequestId: reference(root.request_id ?? root.id ?? outer.request_id ?? metadata.request_id ?? upstream.request_id, privateTexts),
    providerReportedName: typeof metadata.provider_name === "string" && /^[a-zA-Z0-9 ._-]{1,80}$/.test(metadata.provider_name)
      ? sanitizeProviderText(metadata.provider_name, privateTexts, 80) : undefined,
    providerErrorParameter: typeof param === "string" && /^[a-zA-Z0-9_.\[\]-]{1,120}$/.test(param) ? sanitizeProviderText(param, privateTexts, 120) : undefined,
    reasonCategory: /moderation|content.policy|safety|content_filter/i.test(categoryText) ? "content" : undefined,
  };
}

/** Actual responses are bounded; small test doubles may expose only json(). */
export async function readProviderError(response: Response): Promise<unknown> {
  try {
    if (!response.body?.getReader) return await response.json();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        const available = 65_536 - size;
        chunks.push(part.value.subarray(0, available));
        size += part.value.length;
        if (size > 65_536) { truncated = true; await reader.cancel(); break; }
      }
    } finally { reader.releaseLock(); }
    if (truncated) return { error: { message: "Provider error response exceeded the diagnostic size limit." } };
    const text = Buffer.concat(chunks).toString("utf8");
    try { return JSON.parse(text); }
    catch { return { error: { message: /^\s*</.test(text) ? "The endpoint returned a non-JSON gateway error page." : text } }; }
  } catch { return { error: { message: "The endpoint returned an error, but its explanation could not be read." } }; }
}
