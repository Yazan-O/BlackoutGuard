import { useEffect, useRef } from "react";
import { soundSpine } from "./io/audio";
import type { Incident } from "./types";

const FRESH_S = 0.5;

// Drives the shared on-device sound spine (io/audio.ts — the same engine the film view uses) from the
// operator view's playback: heartbeat while a fresh caution/brake is live, hum otherwise, the real
// brake voice line once per braked road user, and 1.0s of silence on a real network drop. The spine
// stays silent until the sound toggle / first gesture enables it, so driving it here is harmless.
export function useOperatorSound(incident: Incident | null, t: number) {
  const spokenTrack = useRef<number | string | null>(null);
  const lastFrame = useRef<number>(Number.POSITIVE_INFINITY);

  useEffect(() => {
    if (!incident) return;
    // replay / scrub-back re-arms the spoken brakes
    if (incident.frame_idx < lastFrame.current) spokenTrack.current = null;
    lastFrame.current = incident.frame_idx;

    const sev = incident.severity;
    const fresh = t - incident.t_video_s <= FRESH_S;
    soundSpine.setState(fresh && (sev === "caution" || sev === "brake") ? "heartbeat" : "hum");

    if (sev === "brake") {
      const who = incident.detections[0]?.track_id ?? incident.incident_id;
      if (who !== spokenTrack.current) {
        spokenTrack.current = who;
        soundSpine.speakBrake(incident.incident_id);
      }
    }
  }, [incident?.incident_id, t]);

  useEffect(() => {
    const onOffline = () => soundSpine.unplug();
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, []);
}
