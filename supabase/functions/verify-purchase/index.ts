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
//     "receipt":      "<base64 receipt>",       // ios
//     "purchaseToken":"<token>"                 // android
//   }
//
// Deploy: supabase functions deploy verify-purchase
//
// Trust & money-safety notes:
//   * The number of credits is read from the server catalog (products.ts), NOT
//     from the client payload. The client may no longer choose its own credit
//     amount.
//   * The account to credit is derived from the verified caller (JWT `sub`),
//     not from the client-supplied userId.
//   * Dedup and crediting happen atomically in one DB transaction, backed by a
//     unique index on provider_transaction_id, so at most one credit per store
//     transaction is ever applied even under concurrent retries.

import { getCaller } from "../_shared/auth.ts";
import { verifyAppleReceipt } from "../_shared/apple.ts";
import { acknowledgeGooglePurchase, verifyGooglePurchase } from "../_shared/google.ts";
import { recordPurchaseAndCredit } from "../_shared/db.ts";
import { getProduct } from "../_shared/products.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const caller = await getCaller(req);
  if (!caller.userId) {
    return json({ error: "unauthenticated" }, 401);
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { platform, productId, receipt, purchaseToken } = payload;
  const userId = caller.userId; // server truth, not client-controlled

  if (!userId || !platform || !productId) {
    return json({ error: "missing fields" }, 400);
  }

  // Credits come from the server catalog only; unknown products are rejected.
  const product = getProduct(productId);
  if (!product) {
    return json({ error: "unknown product" }, 400);
  }
  const credits = product.credits;

  console.log(
    `verify-purchase user=${userId} product=${productId} txn=${receipt ? "apple" : "google"}`,
  );

  // --- Verify the receipt with the store --------------------------------
  let providerTxnId: string | null = null;
  let googleNeedsAck = false;
  if (platform === "ios") {
    const result = await verifyAppleReceipt(receipt, productId);
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
    googleNeedsAck = result.acknowledgementState === 0;
  } else {
    return json({ error: "unknown platform" }, 400);
  }

  // --- Record + credit (atomic, idempotent) -----------------------------
  let outcome;
  try {
    outcome = await recordPurchaseAndCredit({
      userId,
      platform,
      productId,
      providerTxnId,
      credits,
      rawReceipt: receipt ?? purchaseToken ?? "",
    });
  } catch (err: any) {
    // 23505 = unique violation on provider_transaction_id: a concurrent request
    // already recorded this transaction, so nothing to do.
    if (err?.code === "23505") {
      return json({ ok: true, alreadyProcessed: true, balanceDelta: 0 });
    }
    throw err;
  }

  if (outcome.alreadyProcessed) {
    return json({ ok: true, alreadyProcessed: true, balanceDelta: 0 });
  }

  // Google requires purchases to be acknowledged within a few days or the user
  // is refunded (and may re-purchase, risking a future double credit). Ack after
  // we have durably recorded + credited. Idempotent, so safe to retry.
  if (googleNeedsAck) {
    try {
      await acknowledgeGooglePurchase(productId, purchaseToken);
    } catch (err) {
      console.error("google ack failed; will be retried on next verify", err);
    }
  }

  return json({ ok: true, purchaseId: outcome.purchaseId, balanceDelta: credits });
});