import type { Playback } from "./usePlayback";

export function PlaybackControls({ pb }: { pb: Playback }) {
  const span = pb.t1 - pb.t0;
  const pos = span > 0 ? pb.t - pb.t0 : 0;
  return (
    <div className="controls">
      <button className="ctrl-btn" onClick={pb.toggle}>
        {pb.ended ? "Replay" : pb.playing ? "Pause" : "Play"}
      </button>
      <input
        className="ctrl-scrub"
        type="range"
        min={0}
        max={span || 1}
        step={0.01}
        value={pos}
        onChange={(e) => pb.seek(pb.t0 + Number(e.target.value))}
      />
      <span className="ctrl-time">t={pb.t.toFixed(2)}s</span>
    </div>
  );
}
