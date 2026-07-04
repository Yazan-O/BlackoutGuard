import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import gsap from "gsap";
import { activeIncident, latchedBrake, useDemoStore } from "../demo/demoStore";

const RED = new THREE.Color("#ff2d2d");
const AMBER = new THREE.Color("#f5a524");

// Follows the active detection on the demo clock; pops with an elastic snap whenever a new
// incident takes over. bbox is event-frame px (origin top-left) → same centered space as the cloud.
export function DetectionBox({ frame }: { frame: [number, number] }) {
  const group = useRef<THREE.Group>(null);
  const line = useRef<THREE.LineLoop>(null);
  const lastId = useRef<string | null>(null);
  const [fw, fh] = frame;

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
    return g;
  }, []);
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ color: RED, transparent: true, linewidth: 2 }),
    [],
  );

  useFrame(() => {
    const s = useDemoStore.getState();
    const inc = latchedBrake(s) ?? activeIncident(s);
    const det = inc?.detections[0];
    if (!inc || !det) {
      group.current!.visible = false;
      lastId.current = null;
      return;
    }
    group.current!.visible = true;

    const [x, y, w, h] = det.bbox;
    const cx = x + w / 2 - fw / 2;
    const cy = fh / 2 - (y + h / 2);
    const pos = geometry.attributes.position.array as Float32Array;
    pos.set([-w / 2, -h / 2, 0, w / 2, -h / 2, 0, w / 2, h / 2, 0, -w / 2, h / 2, 0]);
    geometry.attributes.position.needsUpdate = true;
    group.current!.position.set(cx, cy, 1);

    material.color = inc.severity === "brake" ? RED : AMBER;

    if (inc.incident_id !== lastId.current) {
      lastId.current = inc.incident_id;
      gsap.fromTo(
        group.current!.scale,
        { x: 1.6, y: 1.6 },
        { x: 1, y: 1, duration: 0.55, ease: "elastic.out(1, 0.45)", overwrite: true },
      );
    }
  });

  return (
    <group ref={group} visible={false}>
      <lineLoop ref={line} geometry={geometry} material={material} />
    </group>
  );
}
