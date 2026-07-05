import { useEffect, useMemo, useState } from "react";
import type { OperatorAction } from "./types";
import { loadClip } from "./fixtures";
import { OfflineBadge } from "./OfflineBadge";
import { AdvisoryBanner } from "./AdvisoryBanner";
import { SplitScreen } from "./SplitScreen";
import { OperatorConsole, type LogEntry } from "./OperatorConsole";
import { agentConfigured, askAgent, fetchAdvisory, postAction } from "./agent";
import { usePlayback } from "./usePlayback";
import { useOperatorSound } from "./useOperatorSound";
import { useSpineStatus } from "./demo/useSoundSpine";
import { soundSpine } from "./io/audio";
import { cachedAdvisory } from "./io/advisories";
import { PlaybackControls } from "./PlaybackControls";

function activeClipId(): string {
  return new URLSearchParams(location.search).get("clip") ?? "clip_zc09a";
}

export default function App() {
  const clipId = activeClipId();
  const records = useMemo(() => loadClip(clipId), [clipId]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Set<string>>(new Set());
  const [log, setLog] = useState<LogEntry[]>([]);
  const [advisories, setAdvisories] = useState<Record<string, string>>({});

  // Playback drives which frame is live: the box follows the pedestrian and the clip holds on the last
  // frame (the brake), so the most-urgent incident lands as the climax. A dismissed frame clears its alert.
  const playback = usePlayback(records);
  const frame = playback.frame;
  const incident = frame && !dismissed.has(frame.incident_id) ? frame : null;
  const overridden = incident ? overrides.has(incident.incident_id) : false;
  const agentOn = agentConfigured();

  // Sound is the shared on-device spine (io/audio.ts) — the same engine the film view uses, so there
  // is one audio system. Its AudioContext can only start after a user gesture (autoplay policy); arm
  // it on the first one. useOperatorSound drives hum/heartbeat, the spoken brake line, and the unplug.
  useEffect(() => {
    const arm = () => soundSpine.enable();
    window.addEventListener("pointerdown", arm, { once: true });
    window.addEventListener("keydown", arm, { once: true });
    return () => {
      window.removeEventListener("pointerdown", arm);
      window.removeEventListener("keydown", arm);
    };
  }, []);
  useOperatorSound(incident, playback.t);

  // Prefer the agent's live advisory (Gemma is the point of the track); fall back to the record's
  // baked line, then a neutral placeholder. Keyed on incident_id so it's fetched once.
  useEffect(() => {
    if (!incident || !agentOn) return;
    if (incident.severity !== "caution" && incident.severity !== "brake") return;
    const id = incident.incident_id;
    let cancelled = false;
    fetchAdvisory(incident).then((a) => {
      if (!cancelled && a) setAdvisories((m) => ({ ...m, [id]: a }));
    });
    return () => {
      cancelled = true;
    };
    // keyed on the incident id, not the record object (which is recomputed each render)
  }, [incident?.incident_id, agentOn]);

  // Prefer the agent's live line; fall back to the committed cache (real Gemma text, offline-safe),
  // then the fixture field. cachedAdvisory keeps the banner truthful even with the agent down.
  const displayedAdvisory = incident
    ? advisories[incident.incident_id] ?? cachedAdvisory(incident.incident_id) ?? incident.advisory ?? null
    : null;

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
        <div className="topbar-right">
          <SoundToggle />
          <OfflineBadge />
        </div>
      </header>

      {records.length === 0 ? (
        <div className="banner info">
          <span className="banner-tag">NO DATA</span>
          <span className="banner-text">No records in contracts/fixtures/{clipId}.json</span>
        </div>
      ) : (
        <AdvisoryBanner incident={incident} advisory={displayedAdvisory} overridden={overridden} />
      )}

      <SplitScreen incident={incident} clipId={clipId} t={playback.t} playing={playback.playing} />

      <PlaybackControls pb={playback} />

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

function SoundToggle() {
  const { enabled, muted } = useSpineStatus();
  const label = !enabled ? "enable sound" : muted ? "sound off" : "sound on";
  return (
    <button
      className={`sound-toggle ${enabled && !muted ? "on" : ""}`}
      onClick={() => (soundSpine.enabled ? soundSpine.setMuted(!soundSpine.muted) : soundSpine.enable())}
    >
      {label}
    </button>
  );
}
