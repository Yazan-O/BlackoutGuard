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

// Streaming Q&A: the bridge answers /ask with stream:true as NDJSON — one {"delta"} per real Gemma
// token, then {"done":true}, or a trailing {"error"} if the local model drops. onDelta receives the
// accumulating answer so the console shows the true token stream. Resolves to the final answer, or
// null if nothing usable streamed (agent absent/down) — the caller degrades honestly, never fabricates.
export async function askStream(
  question: string,
  incidentId: string,
  onDelta: (full: string) => void,
): Promise<string | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, incident_id: incidentId, stream: true }),
    });
    if (!res.ok || !res.body) return null;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let full = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let obj: { delta?: string; done?: boolean; error?: string };
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        if (obj.error) return full || null; // model dropped mid-stream — surface what really arrived
        if (obj.done) return full || null;
        if (typeof obj.delta === "string") {
          full += obj.delta;
          onDelta(full);
        }
      }
    }
    return full || null;
  } catch {
    return null;
  }
}

export interface SoftenedNote {
  class: string;
  corrected_at: string | null;
  note: string; // the agent's own audit line, e.g. "downgraded — you corrected me at 14:32"
}

// Re-ask the agent for an incident's advisory after an override — force=true bypasses the idempotent
// cache so a dismissal's softening actually applies. Returns the agent's real (re-generated) line plus
// its audit annotation, or null when the agent is absent/down. The console fabricates neither.
export async function reAdvise(
  record: Incident,
): Promise<{ advisory: string | null; softened: SoftenedNote | null } | null> {
  if (!BASE) return null;
  try {
    const res = await fetch(`${BASE}/advisory`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...record, force: true }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const rec = Array.isArray(data?.records) ? data.records[0] : data;
    if (!rec) return null;
    return {
      advisory: typeof rec.advisory === "string" ? rec.advisory : null,
      softened: (rec.softened as SoftenedNote) ?? null,
    };
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
