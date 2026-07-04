import * as THREE from "three";

// Byte layout per perception/EVENT_BIN_FORMAT.md: little-endian records of
// x:u16, y:u16, t_ms:f32, pol:u8 — 9 bytes each. Meta JSON carries count/duration/frame.
const RECORD_BYTES = 9;

export interface EventClipMeta {
  layout: string;
  count: number;
  dur_ms: number;
  frame: [number, number];
  t0_ms: number;
}

export interface EventClip {
  geometry: THREE.BufferGeometry;
  meta: EventClipMeta;
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

// Loads the baked real-event binary for a clip. Throws EventAssetError when the asset is
// missing — the scene shows that error loudly; there is no synthetic fallback by design.
// Event binaries drop the fixture's "clip_" prefix: clip_zc09a -> zc09a.events.bin.
export async function loadEventClip(clipId: string): Promise<EventClip> {
  const stem = clipId.replace(/^clip_/, "");
  const base = `${import.meta.env.BASE_URL}clips/${stem}`;
  const [metaRes, binRes] = await Promise.all([
    fetchOrThrow(`${base}.events.meta.json`),
    fetchOrThrow(`${base}.events.bin`),
  ]);
  const meta = (await metaRes.json()) as EventClipMeta;
  const buf = await binRes.arrayBuffer();

  if (buf.byteLength % RECORD_BYTES !== 0) {
    throw new EventAssetError(`${base}.events.bin`, `size ${buf.byteLength} is not a multiple of ${RECORD_BYTES}`);
  }
  const n = buf.byteLength / RECORD_BYTES;
  if (n === 0) throw new EventAssetError(`${base}.events.bin`, "empty file");
  if (meta.count && Math.abs(meta.count - n) > 1) {
    throw new EventAssetError(`${base}.events.bin`, `meta says ${meta.count} events, file holds ${n}`);
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
  return { geometry, meta };
}
