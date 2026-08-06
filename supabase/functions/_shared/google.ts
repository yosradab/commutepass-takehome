// google.ts
// Verifies a Google Play purchase token via the Play Developer API
// (purchases.products.get) and is responsible for acknowledging it.
//
// Set IAP_MOCK=1 to read a canned response from
// fixtures/google-purchase.sample.json instead of calling Google.

const PACKAGE_NAME = "com.commutepass.app";

export interface GoogleVerifyResult {
  ok: boolean;
  orderId: string | null;
  productId: string | null;
  purchaseState: number | null;        // 0 = purchased, 1 = canceled, 2 = pending
  acknowledgementState: number | null; // 0 = not acked, 1 = acked
}

async function playApiToken(): Promise<string> {
  // OAuth2 service-account token exchange lives here in production.
  return Deno.env.get("PLAY_ACCESS_TOKEN") ?? "mock-token";
}

export async function verifyGooglePurchase(
  productId: string,
  purchaseToken: string,
): Promise<GoogleVerifyResult> {
  let json: any;
  if (Deno.env.get("IAP_MOCK") === "1") {
    json = JSON.parse(
      await Deno.readTextFile(
        new URL("../../../fixtures/google-purchase.sample.json", import.meta.url),
      ),
    );
  } else {
    const token = await playApiToken();
    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}` +
      `/purchases/products/${productId}/tokens/${purchaseToken}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    json = await res.json();
  }

  return {
    ok: json.purchaseState === 0,
    orderId: json.orderId ?? null,
    productId: productId,
    purchaseState: json.purchaseState ?? null,
    acknowledgementState: json.acknowledgementState ?? null,
  };
}

// Present but currently unused by the handler.
export async function acknowledgeGooglePurchase(
  productId: string,
  purchaseToken: string,
): Promise<void> {
  if (Deno.env.get("IAP_MOCK") === "1") return;
  const token = await playApiToken();
  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}` +
    `/purchases/products/${productId}/tokens/${purchaseToken}:acknowledge`;
  await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}` } });
}
