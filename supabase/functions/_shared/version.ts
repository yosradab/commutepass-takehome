// version.ts
//
// Numeric semver comparison used by the force-update flow. The reported bug was
// that app versions were compared as plain strings, so "3.10.0" sorted as
// *older* than "3.2.0" and genuinely old builds were not marked for a forced
// update. Compare numerically, segment by segment.

function numericParts(v: string): number[] {
  return v.split(".").map((seg) => {
    const m = seg.match(/^(\d+)/); // drop any non-numeric suffix (e.g. "-beta")
    return m ? parseInt(m[1], 10) : 0;
  });
}

// Returns a negative number if a < b, 0 if equal, positive if a > b.
export function compareVersions(a: string, b: string): number {
  const pa = numericParts(a);
  const pb = numericParts(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}