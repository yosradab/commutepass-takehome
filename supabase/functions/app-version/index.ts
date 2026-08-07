// app-version/index.ts
//
// The app calls this on launch to decide whether to nag or hard-block for an
// update. Given the platform and the running app version, return:
//   { latestVersion, minSupportedVersion, forceUpdate, storeUrl }
//
// `forceUpdate` must be true when the running version is older than
// min_supported_version (the kill-switch we use when a build has a critical
// bug or a breaking backend change).
//
// STATUS: first pass. Works for the happy path in manual testing but the
// product team reported it "sometimes doesn't force-update phones that are
// clearly on an old build." Left as-is for now.

import { sql } from "../_shared/db.ts";
import { compareVersions } from "../_shared/version.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const platform = url.searchParams.get("platform");
  const current = url.searchParams.get("version");

  if (!platform || !current) return json({ error: "missing platform/version" }, 400);

  const rows = await sql<
    { latest_version: string; min_supported_version: string; store_url: string }[]
  >`select latest_version, min_supported_version, store_url
    from app_versions where platform = ${platform}`;

  if (rows.length === 0) return json({ error: "unknown platform" }, 404);

  const cfg = rows[0];

  // Force update if the current (running) version is behind the minimum
  // supported one. Comparison is numeric (semver), not lexicographic.
  const forceUpdate = compareVersions(current, cfg.min_supported_version) < 0;

  return json({
    latestVersion: cfg.latest_version,
    minSupportedVersion: cfg.min_supported_version,
    forceUpdate,
    storeUrl: cfg.store_url,
  });
});
