import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import { blockPoint, type Filament, type Pulse } from "../demo/scenes/spacetime";

const HERO_RED = "#ff2d2d";
const CONTEXT_RED = "#6f2534";
const CAUTION_AMBER = "#f5a524";

// One track's real bbox centroids as a 3-D polyline through the block (x, y, z=t). No interpolation
// beyond straight segments between real detections; a gap between tracks stays a gap. The hero rider
// carries two glowing pulses at the caution and brake incident z's.
export function TrackFilament({
  filament,
  frame,
  durMs,
  pulses = [],
  isolatedTrackId,
  onClick,
}: {
  filament: Filament;
  frame: [number, number];
  durMs: number;
  pulses?: Pulse[];
  isolatedTrackId: number | null;
  onClick?: (trackId: number) => void;
}) {
  const points = useMemo(
    () => filament.points.map((p) => blockPoint(p.cx, p.cy, p.tS, frame, durMs)),
    [filament, frame, durMs],
  );

  const dimmed = isolatedTrackId != null && isolatedTrackId !== filament.trackId;
  const color = filament.isHero ? HERO_RED : CONTEXT_RED;
  const width = filament.isHero ? 3.4 : 1.6;
  const opacity = dimmed ? 0.06 : filament.isHero ? 0.95 : 0.5;

  const myPulses = useMemo(
    () =>
      pulses
        .filter((p) => p.tS >= filament.points[0].tS && p.tS <= filament.points[filament.points.length - 1].tS)
        .map((p) => {
          // land the pulse on the nearest real detection so it sits on the braid, not between it
          let best = filament.points[0];
          for (const pt of filament.points) if (Math.abs(pt.tS - p.tS) < Math.abs(best.tS - p.tS)) best = pt;
          return { kind: p.kind, pos: blockPoint(best.cx, best.cy, best.tS, frame, durMs) };
        }),
    [pulses, filament, frame, durMs],
  );

  if (points.length < 2 && myPulses.length === 0) return null;

  return (
    <group>
      {points.length >= 2 && (
        <Line
          points={points}
          color={color}
          lineWidth={dimmed ? 1 : width}
          transparent
          opacity={opacity}
          depthTest={false}
          renderOrder={2}
          onClick={(e) => {
            e.stopPropagation();
            onClick?.(filament.trackId);
          }}
        />
      )}
      {!dimmed &&
        myPulses.map((p, i) => (
          <PulseMarker key={i} position={p.pos} color={p.kind === "brake" ? HERO_RED : CAUTION_AMBER} />
        ))}
    </group>
  );
}

// A slow-breathing incident marker: a bright core with a soft additive halo. Marks a real caution or
// brake frame — communicative, not decorative; the breathe is deliberate and slow.
function PulseMarker({ position, color }: { position: [number, number, number]; color: string }) {
  const halo = useRef<THREE.Mesh>(null);
  const c = useMemo(() => new THREE.Color(color), [color]);

  useFrame((state) => {
    if (!halo.current) return;
    const s = 1 + 0.28 * Math.sin(state.clock.elapsedTime * 3.2);
    halo.current.scale.setScalar(s);
  });

  return (
    <group position={position} renderOrder={3}>
      <mesh renderOrder={3}>
        <sphereGeometry args={[4.2, 16, 16]} />
        <meshBasicMaterial color={c} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh ref={halo} renderOrder={3}>
        <sphereGeometry args={[9, 16, 16]} />
        <meshBasicMaterial
          color={c}
          transparent
          opacity={0.35}
          depthTest={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
