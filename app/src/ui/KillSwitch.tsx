import { useDemoStore } from "../demo/demoStore";
import { soundSpine } from "../io/audio";
import "./console.css";

// A physical-feeling breaker wired to the real network state (store.networkUp, which the real
// offline/online events drive). Throwing it runs the SAME Stage-2 unplug path as the on-camera cable
// pull — one real second of silence from the sound spine, then the heartbeat resumes, and the film's
// timeline (subscribed to networkUp dropping) continues on local Gemma. It cuts real audio; it never
// fabricates data. The ON-DEVICE · OFFLINE badge stays green throughout — it never flips red.
export function KillSwitch() {
  const networkUp = useDemoStore((s) => s.networkUp);
  const setNetworkUp = useDemoStore((s) => s.setNetworkUp);

  const throwBreaker = () => {
    if (!networkUp) return;
    setNetworkUp(false); // mirror the cable pull into the store — exactly what window 'offline' does
    if (soundSpine.state !== "silence") soundSpine.unplug(); // don't double-cut if the cable already dropped
  };

  return (
    <div className={`kill-switch ${networkUp ? "armed" : "thrown"}`}>
      <div className="ks-body">
        <span className="ks-title">UPLINK BREAKER</span>
        <span className="ks-state">
          {networkUp ? "link up · on-device" : "cut · still running on local Gemma"}
        </span>
      </div>
      <button className="ks-lever" onClick={throwBreaker} disabled={!networkUp} aria-pressed={!networkUp}>
        <span className="ks-knob" />
        <span className="ks-lever-text">{networkUp ? "THROW" : "CUT"}</span>
      </button>
    </div>
  );
}
