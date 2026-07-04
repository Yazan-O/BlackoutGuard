# Event-stream binary format (particle render)

Baked from raw DSEC `events_left` (datasets `events/{x,y,t,p}` + `t_offset` + `ms_to_idx`;
640x480; polarity 0/1). One binary per clip window, streamed by the WebGL/WebGPU particle loader.
Source: real DSEC events only — never synthesized. Extractor: `perception/event_bake.py` (runs on yorha).

## Files per clip (`app/public/clips/<clip>.events.*`)

| File | Tier | Events | Size |
|---|---|---|---|
| `<clip>.events.bin` | WebGL fallback | ~420k (uniform stride) | ~3.8 MB |
| `<clip>.events.full.bin` | WebGPU | ~5.0-5.2M (capped at 5M) | ~45-47 MB |
| `<clip>.events.meta.json` | both | — | <1 KB |

The 400k tier is a strict subset of the full tier (further-strided in memory), so they align.
Full tier is capped at 5M events — every 15s window holds 140-370M raw events, so `truncated: true`.

## Record layout — 9 bytes, packed, little-endian

Each event is one 9-byte record, fields back-to-back with NO padding:

```
offset  bytes  field   type       range
  0       2    x       uint16 LE  0..639
  2       2    y       uint16 LE  0..479
  4       4    t_ms    float32 LE 0..dur_ms   (ms since WINDOW start, not stream start)
  8       1    pol     uint8      0 or 1
```

Record stride = 9 bytes. `file_size == count * 9` (assert this on load).

**`t_ms` is relative to the clip window start** (`t0_ms = w0*1000`), so it runs 0..15000 for a
15s window. This keeps float32 exact (window ms << 2^24 = 16.7M; absolute DSEC time with `t_offset`
~5.8e10 would quantize to ~4ms) AND lets the loader sync particles to the incident fixtures, whose
`t_video_s` is also window-relative (0..15s).

## meta.json fields

```jsonc
{
  "clip_id": "zc12a",
  "sequence": "zurich_city_12_a",
  "layout": "x:u16,y:u16,t_ms:f32,pol:u8 LE",
  "record_bytes": 9,
  "count":            420711,     // events in the DEFAULT (downsampled) .bin
  "count_downsampled":420711,
  "count_full":      5048525,     // events in .events.full.bin
  "count_in_window": 373590780,   // raw events available (before capping/striding)
  "truncated": true,              // full tier hit the 5M cap
  "dur_ms": 15000.0,
  "frame": [640, 480],
  "t0_ms": 10000.0,               // window start in stream-relative ms (w0*1000)
  "window_s": [10.0, 25.0],
  "downsample_stride": 888,       // effective stride from raw window -> .bin
  "downsample_stride_full": 74    // effective stride from raw window -> .full.bin
}
```

## How the JS loader parses it

The 9-byte record is **NOT 4-byte aligned**, so `t_ms` (a float32 at offset 4, 8, 13, ...) sits at
misaligned addresses. Do **NOT** wrap the buffer in a `Float32Array` — that requires 4-byte alignment
and will throw or read garbage. Use `DataView` with per-record offsets:

```js
async function loadEvents(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  const REC = 9;
  const n = buf.byteLength / REC;              // integer; else the file is corrupt
  const x = new Uint16Array(n);
  const y = new Uint16Array(n);
  const t = new Float32Array(n);               // fresh aligned array we fill ourselves
  const p = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += REC) {
    x[i] = dv.getUint16(o,     true);          // true = little-endian
    y[i] = dv.getUint16(o + 2, true);
    t[i] = dv.getFloat32(o + 4, true);
    p[i] = dv.getUint8(o + 8);
  }
  return { x, y, t, p, count: n };
}
```

For a GPU vertex buffer, upload the raw `ArrayBuffer` with an interleaved attribute layout of
stride 9: `x`/`y` as two `unsigned short` at offsets 0/2, `t_ms` as `float` at offset 4, `pol` as
`unsigned byte` at offset 8. Normalize x,y to clip space by `/640, /480`; drive particle age from
`t_ms / dur_ms`.

Events are time-sorted ascending (`t_ms` monotonic non-decreasing) — the loader can binary-search a
playback cursor by `t_ms` without pre-sorting.
