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

  return (
    <section className="console">
      <div className="console-incident">
        {incident ? (
          <>
            <div className="incident-id">{incident.incident_id}</div>
            <div className="incident-meta">
              frame {incident.frame_idx} · t={incident.t_video_s.toFixed(2)}s · {incident.detections.length} detection(s)
            </div>
            <div className="console-actions">
              <button className="btn override" onClick={onOverride} disabled={overridden}>
                {overridden ? "Overridden" : "Override"}
              </button>
              <button className="btn dismiss" onClick={onDismiss}>
                Dismiss
              </button>
            </div>
          </>
        ) : (
          <div className="incident-meta">No active incident</div>
        )}
      </div>

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
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask the on-device agent about this incident…"
          disabled={!incident}
        />
        <button className="btn ask" type="submit" disabled={!incident}>
          Ask
        </button>
      </form>
      <div className="console-agent-state">
        {agentConfigured ? "local agent endpoint set" : "local agent not connected — actions logged on-device"}
      </div>

      <ul className="console-log">
        {log.map((e, i) => (
          <li key={i} className={`log-${e.kind}`}>
            {e.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
