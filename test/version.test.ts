// test/version.test.ts
//
// These tests describe how force-update SHOULD behave. They exercise the
// numeric semver comparison used by the app-version function
// (../supabase/functions/_shared/version.ts).
//
// Run:  deno test --allow-read

import { compareVersions } from "../supabase/functions/_shared/version.ts";

Deno.test("3.10.0 is newer than 3.2.0", () => {
  if (compareVersions("3.10.0", "3.2.0") <= 0) {
    throw new Error("expected 3.10.0 > 3.2.0");
  }
});

Deno.test("equal versions compare as 0", () => {
  if (compareVersions("3.4.1", "3.4.1") !== 0) throw new Error("expected 0");
});

Deno.test("older patch forces update below minimum", () => {
  // 3.1.9 is below min_supported 3.2.0 => must force update
  if (compareVersions("3.1.9", "3.2.0") >= 0) throw new Error("expected older");
});

Deno.test("two-digit minors sort numerically, not lexicographically", () => {
  // The original bug: string compare said "3.10.0" < "3.2.0".
  if (compareVersions("3.10.0", "3.9.9") <= 0) throw new Error("expected 3.10.0 newer");
  if (compareVersions("3.9.0", "3.2.0") < 0) throw new Error("3.9.0 should be newer than 3.2.0");
});

Deno.test("equal current and min does not force an update", () => {
  if (compareVersions("3.2.0", "3.2.0") !== 0) throw new Error("expected equal");
});

Deno.test("missing segments compare as zero", () => {
  if (compareVersions("3.2", "3.2.0") !== 0) throw new Error("expected equal");
  if (compareVersions("3", "3.0.0") !== 0) throw new Error("expected equal");
});

Deno.test("versions with a suffix still compare numerically", () => {
  if (compareVersions("3.4.1-beta", "3.2.0") <= 0) throw new Error("expected 3.4.1-beta newer");
});
