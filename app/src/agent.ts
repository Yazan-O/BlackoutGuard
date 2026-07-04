import type { Incident, OperatorAction } from "./types";

// The situational-agent lane owns these routes. The app only reaches them when
// VITE_AGENT_URL is set; the default demo path never touches the network. Any
// failure returns null/false so the operator console falls back to local logging.
const BASE = import.meta.env.VITE_AGENT_URL as string | undefined;

export function agentConfigured(): boolean {
  return typeof BASE === "string" && BASE.length > 0;
}

// Model tag as the agent reports it (/health) — the provenance chip must never name a model
// the agent didn't claim, so null (agent absent/down) renders no chip at all.
export async function agentModel(): Promise<string | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.model === "string" ? data.model : null;
  } catch {
    return null;
  }
}

export async function fetchAdvisory(record: Incident): Promise<string | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/advisory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Server returns { records: [ <record with advisory filled> ] }; tolerate a flat shape too.
    const rec = Array.isArray(data?.records) ? data.records[0] : data;
    return typeof rec?.advisory === "string" ? rec.advisory : null;
  } catch {
    return null;
  }
}

export async function askAgent(question: string, incidentId: string): Promise<string | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, incident_id: incidentId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.answer === "string" ? data.answer : null;
  } catch {
    return null;
  }
}

export async function postAction(incidentId: string, action: OperatorAction): Promise<boolean> {
  if (!BASE) return false;
  try {
    const res = await fetch(`${BASE}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ incident_id: incidentId, operator_action: action }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
