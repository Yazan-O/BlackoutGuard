import { useState } from "react";
import type { Incident } from "./types";

export interface LogEntry {
  text: string;
  kind: "action" | "qa" | "system";
}

export function OperatorConsole({
  incident,
  overridden,
  log,
  agentConfigured,
  onAsk,
  onOverride,
  onDismiss,
}: {
  incident: Incident | null;
  overridden: boolean;
  log: LogEntry[];
  agentConfigured: boolean;
  onAsk: (q: string) => void;
  onOverride: () => void;
  onDismiss: () => void;
}) {
  const [q, setQ] = useState("");
  const last = log[0];

  if (!incident) {
    return (
      <section className="console">
        <span className="console-idle">No active incident</span>
      </section>
    );
  }

  return (
    <section className="console">
      <div className="console-row">
        <div className="console-subject">
          <span className="incident-id">{incident.incident_id}</span>
          <span className="incident-meta">
            frame {incident.frame_idx} · t={incident.t_video_s.toFixed(2)}s · {incident.detections.length} detection(s)
          </span>
        </div>
        <div className="console-actions">
          <button className="btn" onClick={onOverride} disabled={overridden}>
            {overridden ? "Overridden" : "Override"}
          </button>
          <button className="btn" onClick={onDismiss}>
            Dismiss
          </button>
          {agentConfigured && (
            <form
              className="console-ask"
              onSubmit={(e) => {
                e.preventDefault();
                const text = q.trim();
                if (!text) return;
                onAsk(text);
                setQ("");
              }}
            >
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the on-device agent…" />
              <button className="btn" type="submit">
                Ask
              </button>
            </form>
          )}
        </div>
      </div>
      {last && <div className={`console-last log-${last.kind}`}>{last.text}</div>}
    </section>
  );
}
