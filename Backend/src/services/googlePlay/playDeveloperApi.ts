import { GoogleAuth } from "google-auth-library";

const androidPublisherScope = "https://www.googleapis.com/auth/androidpublisher";
const apiBaseUrl = "https://androidpublisher.googleapis.com/androidpublisher/v3";

export type GooglePlayProductPurchase = {
  packageName?: string;
  purchaseStateContext?: {
    purchaseState?: string;
  };
  productLineItem?: Array<{
    productId?: string;
    productOfferDetails?: {
      purchaseOptionId?: string;
      consumptionState?: string;
    };
  }>;
  orderId?: string;
  purchaseCompletionTime?: string;
};

export class GooglePlayPurchaseNotFoundError extends Error {
  constructor() {
    super("Google Play purchase was not found.");
    this.name = "GooglePlayPurchaseNotFoundError";
  }
}

export class GooglePlayApiError extends Error {
  constructor(readonly operation: "verify" | "consume") {
    super(`Google Play ${operation} API request failed.`);
    this.name = "GooglePlayApiError";
  }
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return undefined;
  }

  const response = error.response;
  if (typeof response !== "object" || response === null || !("status" in response)) {
    return undefined;
  }

  return typeof response.status === "number" ? response.status : undefined;
}

function getGoogleApiErrorDetails(error: unknown): {
  errorCode?: number | string;
  message?: string;
} {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return {};
  }
  const response = error.response;
  if (typeof response !== "object" || response === null || !("data" in response)) {
    return {};
  }
  const data = response.data;
  if (typeof data !== "object" || data === null || !("error" in data)) {
    return {};
  }
  const apiError = data.error;
  if (typeof apiError !== "object" || apiError === null) {
    return {};
  }

  return {
    ...("code" in apiError && typeof apiError.code === "number" &&
    Number.isSafeInteger(apiError.code)
      ? { errorCode: apiError.code }
      : {}),
    ...("message" in apiError && typeof apiError.message === "string"
      ? { message: apiError.message }
      : {}),
  };
}

function sanitizeGoogleApiErrorMessage(message: string | undefined, purchaseToken: string): string {
  if (!message) {
    return "Google API request failed.";
  }
  if (/"type"\s*:\s*"service_account"/i.test(message)) {
    return "Google API request failed; service-account credentials were redacted.";
  }

  const encodedToken = encodeURIComponent(purchaseToken);
  return message
    .replaceAll(purchaseToken, "[REDACTED]")
    .replaceAll(encodedToken, "[REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]")
    .replace(/"private_key"\s*:\s*"(?:\\.|[^"\\])*"/gi, '"private_key":"[REDACTED]"')
    .replace(/(?:ya29\.[A-Za-z0-9._-]+|Bearer\s+[A-Za-z0-9._~-]+)/gi, "[REDACTED CREDENTIAL]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 500);
}

const auth = new GoogleAuth({ scopes: [androidPublisherScope] });

export async function getProductPurchaseV2(
  packageName: string,
  purchaseToken: string,
): Promise<GooglePlayProductPurchase> {
  const url = `${apiBaseUrl}/applications/${encodeURIComponent(packageName)}` +
    `/purchases/productsv2/tokens/${encodeURIComponent(purchaseToken)}`;

  try {
    const response = await auth.request<GooglePlayProductPurchase>({ url });
    return response.data;
  } catch (error) {
    const httpStatus = getHttpStatus(error);
    const apiError = getGoogleApiErrorDetails(error);
    console.error("Google Play product purchase verification API failed.", {
      httpStatus: httpStatus ?? null,
      errorCode: apiError.errorCode ?? null,
      errorMessage: sanitizeGoogleApiErrorMessage(apiError.message, purchaseToken),
    });

    if (httpStatus === 404 || httpStatus === 400) {
      throw new GooglePlayPurchaseNotFoundError();
    }
    throw new GooglePlayApiError("verify");
  }
}

export async function consumeProductPurchase(
  packageName: string,
  productId: string,
  purchaseToken: string,
): Promise<void> {
  const url = `${apiBaseUrl}/applications/${encodeURIComponent(packageName)}` +
    `/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`;

  try {
    await auth.request({ url, method: "POST" });
  } catch {
    throw new GooglePlayApiError("consume");
  }
}
