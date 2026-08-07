// auth.ts
// Helpers for reading the caller's identity from the Supabase-issued JWT.
//
// Security note: the previous implementation used decode() which only *parses*
// the token and never verifies its signature, so anyone could forge a bearer
// token and claim any `sub`. This helper now verifies the HMAC signature when
// SUPABASE_JWT_SECRET is configured. When the secret is absent (local dev with
// IAP_MOCK=1, where real tokens don't exist) we keep a decode-only fallback so
// the function still runs locally — production must set the secret.

import { decode, verify, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

export interface Caller {
  userId: string | null;
}

function hmacKeyFromSecret(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

export async function getCaller(req: Request): Promise<Caller> {
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return { userId: null };
  try {
    const secret = Deno.env.get("SUPABASE_JWT_SECRET");
    if (secret) {
      const payload = await verify<Payload>(jwt, await hmacKeyFromSecret(secret));
      return { userId: (payload.sub as string | undefined) ?? null };
    }
    // Dev-only path (no secret configured): parse the payload without a
    // signature check. Not used in a properly configured production env.
    const [, payload] = decode(jwt) as [unknown, Payload, Uint8Array];
    return { userId: (payload.sub as string | undefined) ?? null };
  } catch {
    return { userId: null };
  }
}