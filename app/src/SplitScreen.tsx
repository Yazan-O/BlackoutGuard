import { useEffect, useRef, useState } from "react";
import type { Incident } from "./types";
import { BlindnessTimer } from "./BlindnessTimer";

const EVENT_W = 640;
const EVENT_H = 480;
const CANVAS_W = 480;
const SCALE = CANVAS_W / EVENT_W;
const CANVAS_H = EVENT_H * SCALE;
const RED = "#ff2d2d";

// The demo clips are one 1280x480 side-by-side render (RGB left, event right); each panel crops its
// half of the same file. Detection boxes are in event-frame px and overlay the event (right) panel.
// A missing clip falls back to the labeled placeholder; the overlay draws either way.
export function SplitScreen({
  incident,
  clipId,
  t,
  playing,
}: {
  incident: Incident | null;
  clipId: string;
  t: number;
  playing: boolean;
}) {
  const rgbVid = useRef<HTMLVideoElement>(null);
  const evtVid = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [videoOk, setVideoOk] = useState(false);
  const blind = incident?.rgb_blind ?? false;
  const clipSrc = `${import.meta.env.BASE_URL}clips/${clipId}.mp4`;

  useEffect(() => {
    setVideoOk(false);
  }, [clipId]);

  useEffect(() => {
    for (const v of [rgbVid.current, evtVid.current]) {
      if (!v) continue;
      if (playing) {
        if (v.paused) v.play().catch(() => {});
      } else if (!v.paused) {
        v.pause();
      }
      if (Math.abs(v.currentTime - t) > 0.3) {
        try {
          v.currentTime = t;
        } catch {
          // not seekable yet
        }
      }
    }
  }, [t, playing]);

  useEffect(() => {
    const ctx = overlay.current!.getContext("2d")!;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (!incident) return;
    ctx.font = "12px system-ui, sans-serif";
    for (const d of incident.detections) {
      const [x, y, w, h] = d.bbox;
      const rx = x * SCALE;
      const ry = y * SCALE;
      ctx.lineWidth = 2;
      ctx.strokeStyle = RED;
      ctx.strokeRect(rx, ry, w * SCALE, h * SCALE);
      const tag = `${d.class_name} ${d.confidence.toFixed(2)}`;
      const tw = ctx.measureText(tag).width;
      ctx.fillStyle = RED;
      ctx.fillRect(rx, ry - 16, tw + 8, 15);
      ctx.fillStyle = "#000";
      ctx.fillText(tag, rx + 4, ry - 4);
    }
  }, [incident]);

  return (
    <div className="split">
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">RGB CAMERA</span>
          <span className={`panel-state ${blind ? "blind" : "live"}`}>{blind ? "BLIND" : "LIVE"}</span>
        </div>
        <div className="canvas-wrap">
          <video
            ref={rgbVid}
            className="clip-video half-left"
            src={clipSrc}
            muted
            playsInline
            preload="auto"
            style={{ display: videoOk ? "block" : "none" }}
            onLoadedData={() => setVideoOk(true)}
            onError={() => setVideoOk(false)}
          />
          {!videoOk && (
            <div className="clip-placeholder">{blind ? "RGB CAMERA · BLIND" : "RGB feed · clip asset pending"}</div>
          )}
          {incident && blind && <BlindnessTimer targetS={incident.blindness_duration_s} />}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">EVENT CAMERA</span>
          <span className="panel-state sees">SEES</span>
        </div>
        <div className="canvas-wrap">
          <video
            ref={evtVid}
            className="clip-video half-right"
            src={clipSrc}
            muted
            playsInline
            preload="auto"
            style={{ display: videoOk ? "block" : "none" }}
            onLoadedData={() => setVideoOk(true)}
            onError={() => setVideoOk(false)}
          />
          {!videoOk && <div className="clip-placeholder">event stream · clip asset pending</div>}
          <canvas ref={overlay} className="overlay" width={CANVAS_W} height={CANVAS_H} />
        </div>
      </section>
    </div>
  );
}
