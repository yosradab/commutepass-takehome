// test/version.test.ts
//
// These tests describe how force-update SHOULD behave. They import a helper
// that does not exist yet (../supabase/functions/_shared/version.ts). Part of
// the app-version task is to make these pass — create the helper, then wire it
// into the app-version function. Feel free to add more cases.
//
// Run:  deno test --allow-read
//
// import { compareVersions } from "../supabase/functions/_shared/version.ts";
//
// Deno.test("3.10.0 is newer than 3.2.0", () => {
//   if (compareVersions("3.10.0", "3.2.0") <= 0) {
//     throw new Error("expected 3.10.0 > 3.2.0");
//   }
// });
//
// Deno.test("equal versions compare as 0", () => {
//   if (compareVersions("3.4.1", "3.4.1") !== 0) throw new Error("expected 0");
// });
//
// Deno.test("older patch forces update below minimum", () => {
//   // 3.1.9 is below min_supported 3.2.0 => must force update
//   if (compareVersions("3.1.9", "3.2.0") >= 0) throw new Error("expected older");
// });

Deno.test("placeholder — replace with the cases above once the helper exists", () => {
  // no-op so `deno test` is green on a fresh clone
});
