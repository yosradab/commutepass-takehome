// apple.ts
// Verifies an App Store receipt with Apple's verifyReceipt endpoint.
//
// Set IAP_MOCK=1 to short-circuit the network call and read a canned response
// from fixtures/apple-receipt.sample.json (so the function runs locally without
// a shared secret). The validation *logic* is identical in both modes.

const APPLE_PROD = "https://buy.itunes.apple.com/verifyReceipt";
const APPLE_SANDBOX = "https://sandbox.itunes.apple.com/verifyReceipt";

export interface AppleVerifyResult {
  ok: boolean;
  originalTransactionId: string | null;
  productId: string | null;
  status: number;
}

const EMPTY_FAIL: AppleVerifyResult = {
  ok: false,
  originalTransactionId: null,
  productId: null,
  status: -1,
};

export async function verifyAppleReceipt(
  receiptData: string,
  expectedProductId?: string,
): Promise<AppleVerifyResult> {
  const password = Deno.env.get("APPLE_SHARED_SECRET") ?? "";

  if (!receiptData) return { ...EMPTY_FAIL, status: 21002 };

  const ask = async (url: string): Promise<any> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        "receipt-data": receiptData,
        password,
        "exclude-old-transactions": true,
      }),
    });
    return res.json();
  };

  let json: any;
  if (Deno.env.get("IAP_MOCK") === "1") {
    json = JSON.parse(
      await Deno.readTextFile(
        new URL("../../../fixtures/apple-receipt.sample.json", import.meta.url),
      ),
    );
  } else {
    json = await ask(APPLE_PROD);
    // A sandbox receipt sent to the production endpoint is status 21007.
    if (json.status === 21007) json = await ask(APPLE_SANDBOX);
  }

  // status 0 means the receipt is valid. Everything else must be treated as
  // invalid (and the exact code surfaced for support/debugging).
  if (json.status !== 0) {
    return {
      ok: false,
      originalTransactionId: null,
      productId: null,
      status: json.status,
    };
  }

  // in_app may contain many line items (restores, subscriptions, multi-purchase).
  // Pick the latest one for the product we are fulfilling; if none matches the
  // requested product, reject so we never grant a pack the user did not buy.
  const inApp = Array.isArray(json?.receipt?.in_app) ? json.receipt.in_app : [];
  let candidates = expectedProductId
    ? inApp.filter((e: any) => e?.product_id === expectedProductId)
    : inApp;
  candidates = [...candidates].sort(
    (a, b) => (Number(b.purchase_date_ms) || 0) - (Number(a.purchase_date_ms) || 0),
  );
  const chosen = candidates[0];
  if (!chosen) {
    return { ...EMPTY_FAIL, status: 0 };
  }

  return {
    ok: true,
    originalTransactionId: chosen.original_transaction_id ?? chosen.transaction_id ?? null,
    productId: chosen.product_id ?? null,
    status: 0,
  };
}