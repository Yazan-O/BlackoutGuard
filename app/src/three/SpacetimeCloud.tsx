import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useDemoStore } from "../demo/demoStore";
import { BLOCK_DEPTH } from "../demo/scenes/spacetime";
import type { EventClip } from "../io/eventsLoader";

// The Storm cloud, extruded. At uSpacetime=0 every line reduces to the exact Storm math (z += 0,
// only the sweep near uNow is alive, same decay sizes and colours). As uSpacetime tweens to 1 each
// event lifts to z = t/window · depth and all times become visible — the flat cloud rises into a
// ~15 s glass block. Same geometry, same t attribute the loader already fills; nothing new is drawn.
const vert = /* glsl */ `
  attribute float t;
  attribute float polarity;
  uniform float uNow;
  uniform float uDecay;
  uniform float uSpacetime;
  uniform float uWindowMs;
  uniform float uBlockDepth;
  uniform float uReviewMs;
  varying float vAge;
  varying float vPol;
  varying float vPlane;
  void main() {
    vAge = (uNow - t) / uDecay;
    vPol = polarity;

    vec3 p = position;
    p.z += mix(0.0, (t / uWindowMs) * uBlockDepth, uSpacetime);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    // a bright plane sweeps the block as the review cursor scrubs — only in block mode
    vPlane = uSpacetime * (1.0 - clamp(abs(t - uReviewMs) / (uDecay * 2.0), 0.0, 1.0));

    // Storm sizes by age (dead points collapse to 0 and cull); the block is a fine, even mist so
    // 420k additive points read as a luminous glass volume rather than scattered dust.
    float stormSize = (vAge >= 0.0 && vAge <= 1.0) ? (2.6 - 1.4 * clamp(vAge, 0.0, 1.0)) : 0.0;
    gl_PointSize = mix(stormSize, 2.4 + vPlane * 2.0, uSpacetime);
  }`;

const frag = /* glsl */ `
  uniform float uSpacetime;
  varying float vAge;
  varying float vPol;
  varying float vPlane;
  void main() {
    // positive polarity ignites hot-white; negative embers dim blue-gray (Storm palette, frozen)
    vec3 hot = vec3(0.95, 0.97, 1.0);
    vec3 cool = vec3(0.35, 0.42, 0.55);
    vec3 c = mix(cool, hot, vPol);
    float amp = mix(0.55, 1.0, vPol);

    float aStorm = (vAge >= 0.0 && vAge <= 1.0) ? (1.0 - vAge) * (1.0 - vAge) : 0.0;
    float a = mix(aStorm, 0.22 + vPlane * 0.5, uSpacetime) * amp;
    if (a <= 0.0) discard;
    gl_FragColor = vec4(c + vPlane * 0.25, a);
  }`;

export function SpacetimeCloud({ clip, decayMs = 120 }: { clip: EventClip; decayMs?: number }) {
  const mat = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => {
    // seed from the store so a single on-demand render (e.g. ?still) already shows the right state,
    // instead of always starting the material at spacetime 0
    const s = useDemoStore.getState();
    return {
      uNow: { value: s.reviewCursorMs },
      uDecay: { value: decayMs },
      uSpacetime: { value: s.spacetime },
      uWindowMs: { value: clip.meta.dur_ms },
      uBlockDepth: { value: BLOCK_DEPTH },
      uReviewMs: { value: s.reviewCursorMs },
    };
  }, [clip, decayMs]);

  useFrame(() => {
    const s = useDemoStore.getState();
    uniforms.uSpacetime.value = s.spacetime;
    uniforms.uNow.value = s.reviewCursorMs;
    uniforms.uReviewMs.value = s.reviewCursorMs;
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
