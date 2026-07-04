import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useDemoStore } from "../demo/demoStore";
import type { EventClip } from "../io/eventsLoader";

// Playback lives on the GPU: uNow sweeps the playhead and each event ignites as its
// timestamp passes, then embers out over uDecay. Scrubbing is free — no CPU rebuild.
const vert = /* glsl */ `
  attribute float t;
  attribute float polarity;
  uniform float uNow;
  uniform float uDecay;
  varying float vAge;
  varying float vPol;
  void main() {
    vAge = (uNow - t) / uDecay;
    vPol = polarity;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float alive = (vAge >= 0.0 && vAge <= 1.0) ? 1.0 : 0.0;
    gl_PointSize = alive * (2.6 - 1.4 * clamp(vAge, 0.0, 1.0));
  }`;

const frag = /* glsl */ `
  varying float vAge;
  varying float vPol;
  void main() {
    if (vAge < 0.0 || vAge > 1.0) discard;
    float a = 1.0 - vAge;
    // positive polarity ignites hot-white; negative embers dim blue-gray
    vec3 hot  = vec3(0.95, 0.97, 1.0);
    vec3 cool = vec3(0.35, 0.42, 0.55);
    vec3 c = mix(cool, hot, vPol);
    float amp = mix(0.45, 1.0, vPol);
    gl_FragColor = vec4(c, a * a * amp);
  }`;

// 120ms decay ≈ 3.2k live particles on the 420k downsampled tier — dense enough to read the
// street, short enough that motion still traces (the full-res WebGPU tier is a later stage).
export function EventCloud({ clip, decayMs = 120 }: { clip: EventClip; decayMs?: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      // t_ms in the binary is window-relative (0..dur_ms), same axis as playheadMs —
      // meta.t0_ms is stream-relative bookkeeping and must NOT offset the clock here.
      uNow: { value: 0 },
      uDecay: { value: decayMs },
    }),
    [clip, decayMs],
  );

  useFrame(() => {
    // read the store imperatively — the clock ticks at 60fps and must not re-render React
    const s = useDemoStore.getState();
    uniforms.uNow.value = s.playheadMs;
  });

  return (
    <points geometry={clip.geometry} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        vertexShader={vert}
        fragmentShader={frag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
