// verify-purchase/index.ts
//
// Called by the mobile app immediately after StoreKit / Play Billing reports a
// successful purchase. Responsible for:
//   1. verifying the receipt with the store,
//   2. recording the purchase, and
//   3. crediting the user's ride-credit balance.
//
// The client posts JSON:
//   {
//     "userId":       "<uuid>",
//     "platform":     "ios" | "android",
//     "productId":    "credits_100",
//     "credits":      110,
//     "receipt":      "<base64 receipt>",       // ios
//     "purchaseToken":"<token>"                 // android
//   }
//
// Deploy: supabase functions deploy verify-purchase

import { getCaller } from "../_shared/auth.ts";
import { verifyAppleReceipt } from "../_shared/apple.ts";
import { verifyGooglePurchase } from "../_shared/google.ts";
import {
  creditAccount,
  findPurchaseByTxn,
  insertPurchase,
} from "../_shared/db.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const caller = getCaller(req);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { userId, platform, productId, credits, receipt, purchaseToken } = payload;
  console.log(`verify-purchase user=${userId} product=${productId} receipt=${receipt ?? purchaseToken}`);

  if (!userId || !platform || !productId) {
    return json({ error: "missing fields" }, 400);
  }

  // --- Verify the receipt with the store ------------------------------------
  let providerTxnId: string | null = null;
  if (platform === "ios") {
    const result = await verifyAppleReceipt(receipt);
    if (!result.ok) {
      return json({ error: "invalid apple receipt", status: result.status }, 400);
    }
    providerTxnId = result.originalTransactionId;
  } else if (platform === "android") {
    const result = await verifyGooglePurchase(productId, purchaseToken);
    if (!result.ok) {
      return json({ error: "invalid google purchase" }, 400);
    }
    providerTxnId = result.orderId;
  } else {
    return json({ error: "unknown platform" }, 400);
  }

  // --- Record + credit ------------------------------------------------------
  // Don't grant the same receipt twice.
  const existing = providerTxnId ? await findPurchaseByTxn(providerTxnId) : null;
  if (existing) {
    return json({ ok: true, alreadyProcessed: true, balanceDelta: 0 });
  }

  const purchaseId = await insertPurchase({
    userId,
    platform,
    productId,
    providerTxnId,
    credits,
    rawReceipt: receipt ?? purchaseToken ?? "",
  });

  await creditAccount(userId, credits, purchaseId);

  return json({ ok: true, purchaseId, balanceDelta: credits });
});
