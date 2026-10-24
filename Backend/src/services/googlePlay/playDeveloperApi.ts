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
    if (getHttpStatus(error) === 404 || getHttpStatus(error) === 400) {
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
