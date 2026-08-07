// test/catalog.test.ts
//
// Guards the server-side catalog: every known product grants a positive number
// of credits and the requested credits_600 pack grants exactly 700.

import { getProduct, CATALOG } from "../supabase/functions/_shared/products.ts";

Deno.test("credits_600 grants 700 credits for $44.99", () => {
  const p = getProduct("credits_600");
  if (!p) throw new Error("credits_600 missing from catalog");
  if (p.credits !== 700) throw new Error("expected 700 credits");
  if (p.displayPriceUsd !== 44.99) throw new Error("expected $44.99");
});

Deno.test("every catalog product grants positive credits", () => {
  for (const [id, p] of Object.entries(CATALOG)) {
    if (p.productId !== id || p.credits <= 0) {
      throw new Error(`catalog entry malformed: ${id}`);
    }
  }
});