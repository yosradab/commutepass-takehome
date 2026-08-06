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

export async function verifyAppleReceipt(
  receiptData: string,
): Promise<AppleVerifyResult> {
  const body = {
    "receipt-data": receiptData,
    "password": Deno.env.get("APPLE_SHARED_SECRET") ?? "",
    "exclude-old-transactions": true,
  };

  let json: any;
  if (Deno.env.get("IAP_MOCK") === "1") {
    json = JSON.parse(
      await Deno.readTextFile(
        new URL("../../../fixtures/apple-receipt.sample.json", import.meta.url),
      ),
    );
  } else {
    const res = await fetch(APPLE_PROD, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    json = await res.json();
  }

  // status 0 means the receipt is valid.
  if (json.status !== 0) {
    return { ok: false, originalTransactionId: null, productId: null, status: json.status };
  }

  const info = json.receipt?.in_app?.[0] ?? {};
  return {
    ok: true,
    originalTransactionId: info.original_transaction_id ?? null,
    productId: info.product_id ?? null,
    status: 0,
  };
}
