// db.ts
// Thin Postgres helper. In production this wraps the Supabase service-role
// connection; locally it talks to the connection string in DATABASE_URL.
//
// The helper intentionally exposes a low-level query() plus a couple of
// convenience methods that the handler currently uses.

import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const connectionString =
  Deno.env.get("DATABASE_URL") ??
  "postgres://postgres:postgres@localhost:54322/postgres";

export const sql = postgres(connectionString, { max: 5 });

export interface PurchaseRow {
  id: string;
  user_id: string;
  product_id: string;
  provider_transaction_id: string | null;
  credits_granted: number;
}

// Returns the existing purchase for a provider transaction id, if any.
export async function findPurchaseByTxn(
  providerTxnId: string,
): Promise<PurchaseRow | null> {
  const rows = await sql<PurchaseRow[]>`
    select id, user_id, product_id, provider_transaction_id, credits_granted
    from purchases
    where provider_transaction_id = ${providerTxnId}
    limit 1
  `;
  return rows[0] ?? null;
}

export async function insertPurchase(p: {
  userId: string;
  platform: string;
  productId: string;
  providerTxnId: string | null;
  credits: number;
  rawReceipt: string;
}): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    insert into purchases
      (user_id, platform, product_id, provider_transaction_id, credits_granted, raw_receipt)
    values
      (${p.userId}, ${p.platform}, ${p.productId}, ${p.providerTxnId}, ${p.credits}, ${p.rawReceipt})
    returning id
  `;
  return rows[0].id;
}

export async function creditAccount(
  userId: string,
  credits: number,
  purchaseId: string,
): Promise<void> {
  await sql`
    update credit_balances
    set balance = balance + ${credits}, updated_at = now()
    where user_id = ${userId}
  `;
  await sql`
    insert into credit_ledger (user_id, delta, reason, purchase_id)
    values (${userId}, ${credits}, 'purchase', ${purchaseId})
  `;
}
