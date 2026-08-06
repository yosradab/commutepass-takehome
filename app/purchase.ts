// app/purchase.ts  (Capacitor client — excerpt)
//
// This is how the mobile app calls the backend after a store purchase
// completes. Included for context; you are NOT expected to build the native
// side. It shows exactly what the client sends today.

import { Capacitor } from "@capacitor/core";
// Community Capacitor IAP plugin (StoreKit + Play Billing under the hood).
import { InAppPurchase } from "some-capacitor-iap-plugin";

const CREDIT_PACKS = [
  { productId: "credits_20", credits: 20 },
  { productId: "credits_100", credits: 110 },
  { productId: "credits_250", credits: 280 },
];

export async function buyCredits(userId: string, productId: string) {
  const pack = CREDIT_PACKS.find((p) => p.productId === productId)!;

  // Kicks off the native store sheet and resolves when the user pays.
  const tx = await InAppPurchase.purchase({ productId });

  const platform = Capacitor.getPlatform(); // 'ios' | 'android'

  const res = await fetch(`${API_BASE}/functions/v1/verify-purchase`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await getAccessToken()}`,
    },
    body: JSON.stringify({
      userId,
      platform,
      productId,
      credits: pack.credits, // <- how many credits to grant
      receipt: tx.appStoreReceipt, // ios
      purchaseToken: tx.purchaseToken, // android
    }),
  });

  const result = await res.json();
  // The app optimistically shows `pack.credits` added to the wallet.
  return result;
}

declare const API_BASE: string;
declare function getAccessToken(): Promise<string>;
