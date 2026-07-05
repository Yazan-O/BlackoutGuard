import { useMemo } from "react";
import * as THREE from "three";
import type { Incident } from "../../types";
import { Frustums } from "../../three/Frustums";
import { Ghost } from "../../three/Ghost";
import { useDemoStore } from "../demoStore";
import { FOCAL_PX, WITNESS_SCALE, blindRuns, ghostTrack, isBlindAt } from "./spacetime";

const FAR_M = 16;

// The reconstruction: a wireframe ground plane, the two sensor frustums, and the ghost walking the
// depth-from-geometry trajectory between them. All metric (metres), scaled up so the same camera rig
// frames it. The RGB frustum goes dark for the exact seconds rgb_blind is true at the review cursor.
export function WitnessScene({ incidents, frame }: { incidents: Incident[]; frame: [number, number] }) {
  const reviewCursorMs = useDemoStore((s) => s.reviewCursorMs);
  const runs = useMemo(() => blindRuns(incidents), [incidents]);
  const samples = useMemo(() => ghostTrack(incidents, frame), [incidents, frame]);
  const blind = isBlindAt(runs, reviewCursorMs / 1000);

  const ground = useMemo(() => {
    const g = new THREE.GridHelper(FAR_M * 2, FAR_M * 2, "#26384a", "#182430");
    const m = g.material as THREE.Material;
    m.transparent = true;
    m.opacity = 0.55;
    m.depthWrite = false;
    return g;
  }, []);

  return (
    <group scale={WITNESS_SCALE}>
      <primitive object={ground} position={[0, 0, FAR_M / 2]} />
      <Frustums frame={frame} focalPx={FOCAL_PX} far={FAR_M} blind={blind} />
      <Ghost samples={samples} />
    </group>
  );
}
