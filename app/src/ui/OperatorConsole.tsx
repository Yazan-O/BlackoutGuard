import { useEffect, useRef, useState } from "react";
import type { Incident, OperatorAction } from "../types";
import { activeIncident, latchedBrake, useDemoStore } from "../demo/demoStore";
import { agentConfigured, agentModel, askStream, postAction, reAdvise } from "../agent";
import { startRecording, micSupported, speak, type Recording } from "../io/stt";
import { TokenStream } from "./TokenStream";
import "./console.css";

// In-scene operator console (Storm/monolith overlay) — a separate component from the ?simple
// split-screen OperatorConsole. The judge types a question and the answer materializes from the
// bridge's real token stream. Nothing renders unless the local agent actually returned it; agent
// absent or dropped degrades to an honest line, never a fabricated answer.

type Phase = "idle" | "streaming" | "done" | "error";

const SOFTEN_CONF_MAX = 0.8; // mirrors the agent's threshold: only genuinely low-confidence cautions soften

// The later caution the downgrade beat lands on: the next low-confidence caution of the same class as
// the dismissed call. The client only *selects* it; the softened line + audit note come from the agent.
function nextSofteningTarget(incidents: Incident[], after: Incident): Incident | null {
  const cls = after.detections[0]?.class_name;
  if (!cls) return null;
  for (const r of incidents) {
    if (r.t_video_s <= after.t_video_s || r.severity !== "caution") continue;
    const d = r.detections[0];
    if (d && d.class_name === cls && d.confidence < SOFTEN_CONF_MAX) return r;
  }
  return null;
}

export function OperatorConsole() {
  const incident = useDemoStore((s) => latchedBrake(s) ?? activeIncident(s));
  const incidents = useDemoStore((s) => s.incidents);
  const overrides = useDemoStore((s) => s.overrides);
  const setOverride = useDemoStore((s) => s.setOverride);
  const qaTranscript = useDemoStore((s) => s.qaTranscript);
  const addQA = useDemoStore((s) => s.addQA);

  const [model, setModel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [live, setLive] = useState(""); // accumulating streamed answer
  const [elapsedS, setElapsedS] = useState(0);
  const [note, setNote] = useState("");
  const [softened, setSoftened] = useState<{ advisory: string; note: string; id: string } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [recording, setRecording] = useState<Recording | null>(null);
  const timer = useRef<number | null>(null);
  const t0 = useRef(0);

  // The stamp must name only the model the running agent claims (/health) — no agent, no model, no
  // stamp. Fetched once; the console still takes typed questions with the stamp simply absent.
  useEffect(() => {
    if (!agentConfigured()) return;
    let cancelled = false;
    agentModel().then((m) => {
      if (!cancelled) setModel(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) clearInterval(timer.current);
    },
    [],
  );

  const ask = async (question: string): Promise<string | null> => {
    if (phase === "streaming") return null;
    setLive("");
    setNote("");
    setElapsedS(0);
    if (!agentConfigured()) {
      setPhase("error");
      setNote("local agent not connected");
      return null;
    }
    setPhase("streaming");
    t0.current = performance.now();
    timer.current = window.setInterval(
      () => setElapsedS((performance.now() - t0.current) / 1000),
      100,
    );
    let got = false;
    const answer = await askStream(question, incident?.incident_id ?? "", (full) => {
      got = true;
      setLive(full);
    });
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setElapsedS((performance.now() - t0.current) / 1000);
    if (answer) {
      setLive(answer);
      setPhase("done");
      addQA(question, answer);
    } else {
      setPhase("error");
      setNote(got ? "local agent dropped mid-answer" : "local agent not connected");
    }
    return answer;
  };

  // Voice loop: press once to record, again to stop. The transcript is on-device whisper (/stt) and the
  // answer is spoken by on-device Piper (/speak) — each honestly absent (null/unspoken) if its model is
  // missing, never faked. The transcript flows into the same streamed ask() and the shared qaTranscript.
  const toggleMic = async () => {
    if (recording) {
      const r = recording;
      setRecording(null);
      const text = await r.stop();
      if (!text) {
        setActionNote("couldn't transcribe — local STT not available");
        return;
      }
      const answer = await ask(text);
      if (answer) void speak(answer);
      return;
    }
    if (!agentConfigured()) {
      setActionNote("local agent not connected");
      return;
    }
    const r = await startRecording();
    if (!r) {
      setActionNote("mic unavailable — type your question instead");
      return;
    }
    setActionNote("");
    setRecording(r);
  };

  const overridden = incident ? Boolean(overrides[incident.incident_id]) : false;

  // The override beat: the judge marks a call a false alarm. The dismiss is real (/action softens that
  // class in the agent); then the next similar low-confidence caution is re-asked with force so the agent
  // genuinely re-generates it — the downgraded line and its "you corrected me at HH:MM" note are the
  // agent's, shown only if it actually softened. Nothing here is hand-written.
  const dismiss = async () => {
    if (!incident || overridden) return;
    const target = incident;
    const action: OperatorAction = { action: "dismiss", note: null, t_utc: null };
    setOverride(target.incident_id, action);
    setSoftened(null);
    setActionNote("");
    if (!agentConfigured()) {
      setActionNote("dismiss logged on-device — local agent not connected");
      return;
    }
    const sent = await postAction(target.incident_id, action);
    if (!sent) {
      setActionNote("dismiss logged on-device — local agent unreachable");
      return;
    }
    const later = nextSofteningTarget(incidents, target);
    if (!later) {
      setActionNote("dismissed — no later similar caution to downgrade");
      return;
    }
    const r = await reAdvise(later);
    if (r?.advisory && r.softened) {
      setSoftened({ advisory: r.advisory, note: r.softened.note, id: later.incident_id });
    } else {
      setActionNote("dismissed — agent returned no downgrade");
    }
  };

  return (
    <section className="op-console">
      <div className="op-head">
        <span className="op-title">OPERATOR</span>
        {incident && <span className="op-ctx">{incident.incident_id}</span>}
      </div>

      {incident && (
        <div className="op-actions">
          <button className="op-dismiss" onClick={dismiss} disabled={overridden}>
            {overridden ? "dismissed — false alarm" : "Dismiss — false alarm"}
          </button>
        </div>
      )}
      {actionNote && <div className="op-note">{actionNote}</div>}

      {softened && (
        <div className="op-softened">
          <span className="op-softened-tag">DOWNGRADED</span>
          <div className="op-softened-adv">{softened.advisory}</div>
          <div className="op-softened-note">{softened.note}</div>
          <div className="op-softened-id">on {softened.id}</div>
        </div>
      )}

      {(phase === "streaming" || phase === "done") && (
        <TokenStream text={live} model={model} elapsedS={elapsedS} streaming={phase === "streaming"} />
      )}
      {phase === "error" && <div className="op-note">{note}</div>}

      <form
        className="op-ask"
        onSubmit={(e) => {
          e.preventDefault();
          const text = q.trim();
          if (!text) return;
          setQ("");
          void ask(text);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask the on-device agent…"
        />
        <button type="submit" disabled={phase === "streaming"}>
          {phase === "streaming" ? "…" : "Ask"}
        </button>
        {micSupported() && (
          <button
            type="button"
            className={`op-mic ${recording ? "rec" : ""}`}
            onClick={toggleMic}
            disabled={phase === "streaming" && !recording}
            aria-label={recording ? "stop recording" : "ask by voice"}
          >
            <span className="op-mic-dot" />
            {recording ? "stop" : "speak"}
          </button>
        )}
      </form>

      {qaTranscript.length > 0 && (
        <ul className="op-transcript">
          {qaTranscript
            .slice(-3)
            .reverse()
            .map((e, i) => (
              <li key={qaTranscript.length - i}>
                <span className="op-q">{e.q}</span>
                <span className="op-a">{e.a}</span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
