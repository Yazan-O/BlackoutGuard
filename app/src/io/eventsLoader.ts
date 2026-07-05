import * as THREE from "three";

// Byte layout per perception/EVENT_BIN_FORMAT.md: little-endian records of
// x:u16, y:u16, t_ms:f32, pol:u8 — 9 bytes each. Meta JSON carries count/duration/frame.
const RECORD_BYTES = 9;

export type EventTier = "hero" | "lite";

export interface EventClipMeta {
  layout: string;
  count: number;
  count_full?: number;
  dur_ms: number;
  frame: [number, number];
  t0_ms: number;
}

export interface EventClip {
  geometry: THREE.BufferGeometry;
  meta: EventClipMeta;
  tier: EventTier;
}

export class EventAssetError extends Error {
  constructor(public url: string, detail: string) {
    super(`event asset failed: ${url} — ${detail}`);
  }
}

async function fetchOrThrow(url: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new EventAssetError(url, String(e));
  }
  if (!res.ok) throw new EventAssetError(url, `HTTP ${res.status}`);
  return res;
}

// hero = the full-res tier (~12x denser, reads as a person); lite = the committed downsampled tier.
// Both share one .events.meta.json and the same 9-byte record layout — only the .bin and its expected
// count differ. count validation is load-bearing: a missing .bin is served as the SPA index.html (200,
// text/html) by the dev server, so trusting the HTTP status alone would parse HTML as events.
function tierFile(tier: EventTier): { suffix: string; count(meta: EventClipMeta): number | undefined } {
  return tier === "hero"
    ? { suffix: ".events.full.bin", count: (m) => m.count_full }
    : { suffix: ".events.bin", count: (m) => m.count };
}

async function loadTier(base: string, meta: EventClipMeta, tier: EventTier): Promise<EventClip> {
  const { suffix, count } = tierFile(tier);
  const url = `${base}${suffix}`;
  const buf = await (await fetchOrThrow(url)).arrayBuffer();

  if (buf.byteLength % RECORD_BYTES !== 0) {
    throw new EventAssetError(url, `size ${buf.byteLength} is not a multiple of ${RECORD_BYTES}`);
  }
  const n = buf.byteLength / RECORD_BYTES;
  if (n === 0) throw new EventAssetError(url, "empty file");
  const expected = count(meta);
  if (expected && Math.abs(expected - n) > 1) {
    throw new EventAssetError(url, `meta says ${expected} events, file holds ${n}`);
  }

  const dv = new DataView(buf);
  const pos = new Float32Array(n * 3);
  const t = new Float32Array(n);
  const pol = new Float32Array(n);
  const [fw, fh] = meta.frame;
  for (let i = 0, o = 0; i < n; i++, o += RECORD_BYTES) {
    // center the sensor frame on the origin, y up (screen y grows downward)
    pos[i * 3] = dv.getUint16(o, true) - fw / 2;
    pos[i * 3 + 1] = fh / 2 - dv.getUint16(o + 2, true);
    pos[i * 3 + 2] = 0;
    t[i] = dv.getFloat32(o + 4, true);
    pol[i] = dv.getUint8(o + 8);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("t", new THREE.BufferAttribute(t, 1));
  geometry.setAttribute("polarity", new THREE.BufferAttribute(pol, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), Math.hypot(fw, fh) / 2);
  return { geometry, meta, tier };
}

// Loads the baked real-event binary for a clip. The hero tier falls back to lite loudly (never
// silently to nothing) when the full-res .bin is absent, so the Storm still renders real events on a
// machine that only has the committed downsampled buffer; a totally missing clip still throws.
// Event binaries drop the fixture's "clip_" prefix: clip_zc09a -> zc09a.events.bin.
export async function loadEventClip(clipId: string, preferred: EventTier = "hero"): Promise<EventClip> {
  const stem = clipId.replace(/^clip_/, "");
  const base = `${import.meta.env.BASE_URL}clips/${stem}`;
  const meta = (await (await fetchOrThrow(`${base}.events.meta.json`)).json()) as EventClipMeta;

  if (preferred === "hero") {
    try {
      return await loadTier(base, meta, "hero");
    } catch (e) {
      const detail = e instanceof EventAssetError ? e.message : String(e);
      console.warn(
        `[eventsLoader] hero tier unavailable (${detail}) — rendering the lite tier. ` +
          `Drop ${stem}.events.full.bin into app/public/clips/ for the dense render.`,
      );
      return await loadTier(base, meta, "lite");
    }
  }
  return await loadTier(base, meta, "lite");
}
