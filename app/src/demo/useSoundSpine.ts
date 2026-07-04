import { useEffect, useSyncExternalStore } from "react";
import { soundSpine } from "../io/audio";
import { activeIncident, latchedBrake, useDemoStore } from "./demoStore";

const FRESH_MS = 500;

// Wires the store to the sound spine: heartbeat while a caution/brake is live (or the brake is
// latched), hum otherwise; a real `offline` event cuts to 1.0s of silence. Also fires the
// committed brake wav once per latched incident, when one exists for the clip.
export function useSoundSpine() {
  useEffect(() => {
    const unsub = useDemoStore.subscribe((s) => {
      const brake = latchedBrake(s);
      const inc = brake ?? activeIncident(s);
      const videoMs = s.clipT0Ms + s.playheadMs;
      const fresh = inc !== null && videoMs - inc.t_video_s * 1000 <= FRESH_MS;
      const alerting =
        brake !== null || (fresh && (inc!.severity === "caution" || inc!.severity === "brake"));
      soundSpine.setState(alerting ? "heartbeat" : "hum");
      if (brake) soundSpine.speakBrake(brake.incident_id);
    });

    const onOffline = () => {
      useDemoStore.getState().setNetworkUp(false);
      soundSpine.unplug();
    };
    const onOnline = () => useDemoStore.getState().setNetworkUp(true);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      unsub();
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);
}

let listeners: (() => void)[] = [];
let snapshot = { state: soundSpine.state, muted: soundSpine.muted, enabled: soundSpine.enabled };

function readSpine() {
  const next = { state: soundSpine.state, muted: soundSpine.muted, enabled: soundSpine.enabled };
  if (
    next.state !== snapshot.state ||
    next.muted !== snapshot.muted ||
    next.enabled !== snapshot.enabled
  ) {
    snapshot = next;
  }
  return snapshot;
}

// The spine is an imperative singleton; poll it at UI cadence for the toggle/status readout.
export function useSpineStatus() {
  useEffect(() => {
    const id = setInterval(() => {
      readSpine();
      listeners.forEach((l) => l());
    }, 150);
    return () => clearInterval(id);
  }, []);
  return useSyncExternalStore(
    (cb) => {
      listeners.push(cb);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    },
    readSpine,
    readSpine,
  );
}
