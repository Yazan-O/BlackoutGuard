import { useMemo, useState } from "react";
import type { OperatorAction, Severity } from "./types";
import { loadClip } from "./fixtures";
import { OfflineBadge } from "./OfflineBadge";
import { AdvisoryBanner } from "./AdvisoryBanner";
import { SplitScreen } from "./SplitScreen";
import { OperatorConsole, type LogEntry } from "./OperatorConsole";
import { agentConfigured, askAgent, postAction } from "./agent";

function activeClipId(): string {
  return new URLSearchParams(location.search).get("clip") ?? "clip03";
}

export default function App() {
  const clipId = activeClipId();
  const records = useMemo(() => loadClip(clipId), [clipId]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [log, setLog] = useState<LogEntry[]>([]);

  // Show the most urgent unhandled incident (brake over caution), not the first in the array,
  // so a multi-record clip surfaces the brake rather than an earlier caution for the same track.
  const severityRank: Record<Severity, number> = { info: 1, caution: 2, brake: 3 };
  const incident =
    records
      .filter((r) => !dismissed.has(r.incident_id))
      .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.t_video_s - a.t_video_s)[0] ?? null;
  const overridden = incident ? overrides.has(incident.incident_id) : false;
  const agentOn = agentConfigured();

  const append = (text: string, kind: LogEntry["kind"]) => setLog((l) => [{ text, kind }, ...l]);

  const doAction = async (kind: "override" | "dismiss") => {
    if (!incident) return;
    const id = incident.incident_id;
    const action: OperatorAction = { action: kind, note: null, t_utc: null };
    if (kind === "dismiss") setDismissed((s) => new Set(s).add(id));
    else setOverrides((s) => new Set(s).add(id));

    const sent = agentOn && (await postAction(id, action));
    const where = sent ? "sent to agent" : agentOn ? "agent unreachable, logged on-device" : "logged on-device";
    append(`${kind} · ${id} · ${where}`, "action");
  };

  const doAsk = async (question: string) => {
    if (!incident) return;
    append(`Q: ${question}`, "qa");
    const answer = agentOn ? await askAgent(question, incident.incident_id) : null;
    if (answer) append(`A: ${answer}`, "qa");
    else if (agentOn) append("agent unreachable — question logged on-device", "system");
    else append("local agent not connected — question logged on-device", "system");
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">BlackoutGuard</span>
          <span className="brand-sub">on-device road-safety agent</span>
        </div>
        <OfflineBadge />
      </header>

      {records.length === 0 ? (
        <div className="banner info">
          <span className="banner-tag">NO DATA</span>
          <span className="banner-text">No records in contracts/fixtures/{clipId}.json</span>
        </div>
      ) : (
        <AdvisoryBanner incident={incident} overridden={overridden} />
      )}

      <SplitScreen incident={incident} />

      <OperatorConsole
        incident={incident}
        overridden={overridden}
        log={log}
        agentConfigured={agentOn}
        onAsk={doAsk}
        onOverride={() => doAction("override")}
        onDismiss={() => doAction("dismiss")}
      />

      <footer className="footer">
        Built during RAISE Summit · renders local event-camera perception + local Gemma advisories · nothing leaves the vehicle.
      </footer>
    </div>
  );
}
