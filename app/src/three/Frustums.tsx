import { useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";

// The two sensors as wireframe view volumes down the road. The RGB frustum's fill drops out while the
// RGB camera is blind; the event frustum's never does. Reads as the forensic exhibit: for the two
// seconds the RGB saw nothing, the event camera's cone stayed lit — which is why the crash never happened.
function FrustumParts(apex: THREE.Vector3, halfW: number, halfH: number, far: number) {
  const z = apex.z + far;
  const corners = [
    new THREE.Vector3(apex.x - halfW, apex.y - halfH, z),
    new THREE.Vector3(apex.x + halfW, apex.y - halfH, z),
    new THREE.Vector3(apex.x + halfW, apex.y + halfH, z),
    new THREE.Vector3(apex.x - halfW, apex.y + halfH, z),
  ];
  const edgePts: THREE.Vector3[] = [];
  for (const c of corners) edgePts.push(apex.clone(), c.clone());
  for (let i = 0; i < 4; i++) edgePts.push(corners[i].clone(), corners[(i + 1) % 4].clone());
  const edges = new THREE.BufferGeometry().setFromPoints(edgePts);

  const fill = new THREE.BufferGeometry();
  const tri: number[] = [];
  const push = (v: THREE.Vector3) => tri.push(v.x, v.y, v.z);
  for (let i = 0; i < 4; i++) {
    push(apex);
    push(corners[i]);
    push(corners[(i + 1) % 4]);
  }
  push(corners[0]);
  push(corners[1]);
  push(corners[2]);
  push(corners[0]);
  push(corners[2]);
  push(corners[3]);
  fill.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
  return { edges, fill };
}

function Frustum({
  apex,
  frame,
  focalPx,
  far,
  color,
  label,
  labelState,
  fillOn,
}: {
  apex: [number, number, number];
  frame: [number, number];
  focalPx: number;
  far: number;
  color: string;
  label: string;
  labelState: string;
  fillOn: boolean;
}) {
  const [fw, fh] = frame;
  const { edges, fill } = useMemo(() => {
    const a = new THREE.Vector3(apex[0], apex[1], apex[2]);
    return FrustumParts(a, (fw / 2 / focalPx) * far, (fh / 2 / focalPx) * far, far);
  }, [apex, fw, fh, focalPx, far]);

  return (
    <group>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={color} transparent opacity={fillOn ? 0.85 : 0.32} depthWrite={false} />
      </lineSegments>
      {fillOn && (
        <mesh geometry={fill}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.06}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
      <Html position={apex} className="witness-frustum-label" pointerEvents="none">
        {label} <span className={fillOn ? "on" : "off"}>{labelState}</span>
      </Html>
    </group>
  );
}

export function Frustums({
  frame,
  focalPx,
  far,
  blind,
}: {
  frame: [number, number];
  focalPx: number;
  far: number;
  blind: boolean;
}) {
  return (
    <group>
      <Frustum
        apex={[-0.4, 1.2, 0]}
        frame={frame}
        focalPx={focalPx}
        far={far}
        color="#c9b79a"
        label="RGB"
        labelState={blind ? "BLIND" : "SEES"}
        fillOn={!blind}
      />
      <Frustum
        apex={[0.4, 1.2, 0]}
        frame={frame}
        focalPx={focalPx}
        far={far}
        color="#9fb8d6"
        label="EVENT"
        labelState="SEES"
        fillOn={true}
      />
    </group>
  );
}
