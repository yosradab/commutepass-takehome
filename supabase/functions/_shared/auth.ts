// auth.ts
// Helpers for reading the caller's identity from the Supabase-issued JWT.
// Supabase puts the verified user id in the `sub` claim of the bearer token
// that the mobile client attaches to every authenticated request.

import { decode } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

export interface Caller {
  userId: string | null;
}

// Decodes the bearer token and returns the subject claim.
// NOTE: decode() does not verify the signature — it only parses the payload.
export function getCaller(req: Request): Caller {
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return { userId: null };
  try {
    const [, payload] = decode(jwt) as [unknown, Record<string, unknown>, unknown];
    return { userId: (payload.sub as string) ?? null };
  } catch {
    return { userId: null };
  }
}
