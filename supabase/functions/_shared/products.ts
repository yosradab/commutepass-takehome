// products.ts
// Server-side product catalog. This is the source of truth for how many
// credits each product grants. Store product IDs must match App Store Connect
// and Google Play Console exactly.

export interface Product {
  productId: string;
  credits: number;
  // Display price is informational only; billing is enforced by the stores.
  displayPriceUsd: number;
}

export const CATALOG: Record<string, Product> = {
  credits_20: { productId: "credits_20", credits: 20, displayPriceUsd: 1.99 },
  credits_100: { productId: "credits_100", credits: 110, displayPriceUsd: 8.99 }, // 10% bonus
  credits_250: { productId: "credits_250", credits: 280, displayPriceUsd: 19.99 },
  credits_600: { productId: "credits_600", credits: 700, displayPriceUsd: 44.99 },
};

export function getProduct(productId: string): Product | undefined {
  return CATALOG[productId];
}
