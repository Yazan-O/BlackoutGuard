import { useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";

// One contiguous rgb_blind window as a dark bounded slab across the full x,y frame, spanning its
// real z (time) range. Drawn before the cloud so it darkens the background in its footprint; the
// additive event braid then glows through it — the event camera still seeing inside the RGB's dark.
export function VoidSlab({
  frame,
  zStart,
  zEnd,
  isHero,
  label,
  onClick,
}: {
  frame: [number, number];
  zStart: number;
  zEnd: number;
  isHero: boolean;
  label?: string;
  onClick?: () => void;
}) {
  const [fw, fh] = frame;
  const depth = Math.max(1, zEnd - zStart);
  const zMid = (zStart + zEnd) / 2;

  const box = useMemo(() => new THREE.BoxGeometry(fw, fh, depth), [fw, fh, depth]);
  const edges = useMemo(() => new THREE.EdgesGeometry(box), [box]);

  return (
    <group position={[0, 0, zMid]}>
      <mesh
        geometry={box}
        renderOrder={1}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      >
        {/* the hero blindout is the dark slab the braid pierces (drawn after the additive cloud so
            it dims its own time-band); the other blindouts are edge-framed only — this clip is RGB-
            blind most of its 15 s, so darkening every one would black out the whole block. The near-
            invisible context fill stays only as a click target for the blindness stats. */}
        <meshBasicMaterial
          color="#000000"
          transparent
          opacity={isHero ? 0.52 : 0.04}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={edges} renderOrder={2}>
        <lineBasicMaterial
          color={isHero ? "#8ea6c8" : "#3d4a5e"}
          transparent
          opacity={isHero ? 0.95 : 0.5}
          depthWrite={false}
        />
      </lineSegments>
      {label && (
        <Html position={[-fw / 2 + 12, fh / 2 - 14, depth / 2]} className="monolith-void-label" pointerEvents="none">
          {label}
        </Html>
      )}
    </group>
  );
}
