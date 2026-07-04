import type { Incident } from "./types";

// Baked incident records are bundled at build time, so the app renders with zero network calls.
const files = import.meta.glob<Incident[]>("../../contracts/fixtures/*.json", {
  eager: true,
  import: "default",
});

const byClip: Record<string, Incident[]> = {};
for (const [path, records] of Object.entries(files)) {
  const clip = path.split("/").pop()!.replace(".json", "");
  byClip[clip] = records;
}

export function loadClip(clipId: string): Incident[] {
  return byClip[clipId] ?? [];
}
