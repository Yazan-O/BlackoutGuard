import { useMemo } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import { useDemoStore } from "../demo/demoStore";
import type { GhostSample } from "../demo/scenes/spacetime";

const GHOST = "#bfe0ea";

// The pedestrian-height depth estimate made walkable. Every ghost position is one real detection's
// derived (X, Z) — the marker snaps to the detection nearest the review cursor rather than
// interpolating, so no in-between position is invented. The trail breaks at the gap between the two
// rider tracks instead of drawing a segment across it. Method is captioned on screen, never measured.
export function Ghost({ samples }: { samples: GhostSample[] }) {
  const reviewCursorMs = useDemoStore((s) => s.reviewCursorMs);

  const segments = useMemo(() => {
    const segs: [number, number, number][][] = [];
    let cur: [number, number, number][] = [];
    let prevT = -Infinity;
    for (const s of samples) {
      if (s.tS - prevT > 0.2 && cur.length) {
        segs.push(cur);
        cur = [];
      }
      cur.push([s.X, s.Y, s.Z]);
      prevT = s.tS;
    }
    if (cur.length) segs.push(cur);
    return segs;
  }, [samples]);

  const here = useMemo(() => {
    if (!samples.length) return null;
    const tS = reviewCursorMs / 1000;
    let best = samples[0];
    for (const s of samples) if (Math.abs(s.tS - tS) < Math.abs(best.tS - tS)) best = s;
    return best;
  }, [samples, reviewCursorMs]);

  if (!here) return null;

  return (
    <group>
      {segments.map((pts, i) =>
        pts.length >= 2 ? (
          <Line key={i} points={pts} color={GHOST} lineWidth={1.3} transparent opacity={0.4} depthTest={false} />
        ) : null,
      )}
      <group position={[here.X, 0, here.Z]}>
        <mesh position={[0, 0.85, 0]}>
          <capsuleGeometry args={[0.26, 1.12, 6, 12]} />
          <meshBasicMaterial color={GHOST} transparent opacity={0.5} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.34, 0.44, 28]} />
          <meshBasicMaterial color={GHOST} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
