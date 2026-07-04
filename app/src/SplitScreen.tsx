import { useEffect, useRef } from "react";
import type { Incident } from "./types";
import { BlindnessTimer } from "./BlindnessTimer";

const EVENT_W = 640;
const EVENT_H = 480;
const CANVAS_W = 480;
const SCALE = CANVAS_W / EVENT_W;
const CANVAS_H = EVENT_H * SCALE;
const RED = "#ff2d2d";

export function SplitScreen({ incident }: { incident: Incident | null }) {
  const rgbRef = useRef<HTMLCanvasElement>(null);
  const eventRef = useRef<HTMLCanvasElement>(null);
  const blind = incident?.rgb_blind ?? false;

  useEffect(() => {
    drawRgb(rgbRef.current!, incident);
  }, [incident]);

  useEffect(() => {
    drawEvent(eventRef.current!, incident);
  }, [incident]);

  return (
    <div className="split">
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">RGB CAMERA</span>
          <span className={`panel-state ${blind ? "blind" : "live"}`}>{blind ? "BLIND" : "LIVE"}</span>
        </div>
        <div className="canvas-wrap">
          <canvas ref={rgbRef} width={CANVAS_W} height={CANVAS_H} />
          {incident && blind && (
            <BlindnessTimer durationS={incident.blindness_duration_s} incidentId={incident.incident_id} />
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">EVENT CAMERA</span>
          <span className="panel-state sees">SEES</span>
        </div>
        <div className="canvas-wrap">
          <canvas ref={eventRef} width={CANVAS_W} height={CANVAS_H} />
        </div>
      </section>
    </div>
  );
}

function drawRgb(cv: HTMLCanvasElement, inc: Incident | null) {
  const ctx = cv.getContext("2d")!;
  const blind = inc?.rgb_blind ?? false;
  ctx.fillStyle = blind ? "#050506" : "#1a1c22";
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = "#4a4d57";
  ctx.font = "13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(blind ? "RGB CAMERA · BLIND" : "RGB feed · clip asset pending", cv.width / 2, cv.height / 2);
}

function drawEvent(cv: HTMLCanvasElement, inc: Incident | null) {
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#050506";
  ctx.fillRect(0, 0, cv.width, cv.height);

  // Real event-camera frames drop into this same 640x480 logical space when the
  // devola asset slice lands; the detection boxes below are real fixture data.
  ctx.fillStyle = "#3a3d46";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("event stream · clip asset pending", cv.width / 2, 18);

  if (!inc) return;
  ctx.textAlign = "left";
  for (const d of inc.detections) {
    const [x, y, w, h] = d.bbox;
    const rx = x * SCALE;
    const ry = y * SCALE;
    ctx.lineWidth = 2;
    ctx.strokeStyle = RED;
    ctx.strokeRect(rx, ry, w * SCALE, h * SCALE);

    const tag = `${d.class_name} ${d.confidence.toFixed(2)}`;
    ctx.font = "12px system-ui, sans-serif";
    const tw = ctx.measureText(tag).width;
    ctx.fillStyle = RED;
    ctx.fillRect(rx, ry - 16, tw + 8, 15);
    ctx.fillStyle = "#000";
    ctx.fillText(tag, rx + 4, ry - 4);
  }
}
