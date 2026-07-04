// Real advisories from the situational agent's committed cache (agent/cache/<incident_id>.txt),
// bundled at build time so the lower-third shows the real Gemma line with zero runtime network —
// the same disclosed-cache pattern as the Piper wav cache in io/audio.ts. The provenance chip's
// model still comes from the live agent /health, so nothing here names a model the agent didn't claim.
const files = import.meta.glob<string>("../../../agent/cache/*.txt", {
  eager: true,
  query: "?raw",
  import: "default",
});

const byId: Record<string, string> = {};
for (const [path, text] of Object.entries(files)) {
  const id = path.split("/").pop()!.replace(".txt", "");
  const trimmed = (text as string).trim();
  if (trimmed) byId[id] = trimmed;
}

export function cachedAdvisory(incidentId: string): string | null {
  return byId[incidentId] ?? null;
}
