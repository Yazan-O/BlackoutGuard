// Sound spine, fully synthesized on-device: hum (normal) → heartbeat (incident) → hard
// silence on unplug. No audio files, no network — oscillators and a noise buffer only.
// The context is created on the first user gesture (autoplay policy), via enable().

export type SpineState = "hum" | "heartbeat" | "silence";

const HEARTBEAT_BPM = 60;
const UNPLUG_SILENCE_S = 1.0;

// Committed advisory wavs, bundled at build time so playback needs no runtime network.
// Only clips that have real Piper renders appear here; absence = heartbeat only, never TTS.
const wavUrls = import.meta.glob<string>("../../../voice/cache/*.wav", {
  eager: true,
  query: "?url",
  import: "default",
});

class SoundSpine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private humGain!: GainNode;
  private beatGain!: GainNode;
  private beatTimer: number | null = null;
  private silenceTimer: number | null = null;
  private spokenIds = new Set<string>();
  state: SpineState = "hum";
  muted = false;
  enabled = false;

  enable() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);

    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humGain.connect(this.master);
    for (const [freq, g] of [
      [55, 0.05],
      [57.3, 0.035],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const og = ctx.createGain();
      og.gain.value = g;
      osc.connect(og).connect(this.humGain);
      osc.start();
    }
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 120;
    const ng = ctx.createGain();
    ng.gain.value = 0.02;
    noise.connect(lp).connect(ng).connect(this.humGain);
    noise.start();

    this.beatGain = ctx.createGain();
    this.beatGain.gain.value = 0;
    this.beatGain.connect(this.master);

    this.enabled = true;
    this.apply(this.state, true);
  }

  private thump(at: number, freq: number, peak: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, at + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(g).connect(this.beatGain);
    osc.start(at);
    osc.stop(at + 0.3);
  }

  private startBeat() {
    if (this.beatTimer !== null) return;
    const period = 60 / HEARTBEAT_BPM;
    const schedule = () => {
      const ctx = this.ctx!;
      const t = Math.ceil(ctx.currentTime / period) * period;
      // lub-dub: two thumps 180ms apart, once per beat
      this.thump(t, 58, 0.5);
      this.thump(t + 0.18, 48, 0.32);
    };
    schedule();
    this.beatTimer = window.setInterval(schedule, (60 / HEARTBEAT_BPM) * 1000);
  }

  private stopBeat() {
    if (this.beatTimer !== null) {
      clearInterval(this.beatTimer);
      this.beatTimer = null;
    }
  }

  setState(next: Exclude<SpineState, "silence">) {
    if (this.state === "silence") return; // the unplug beat owns the spine until its 1.0s elapses
    if (this.state === next) return;
    this.apply(next);
  }

  private apply(next: SpineState, force = false) {
    if (!this.enabled) {
      this.state = next;
      return;
    }
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    if (next === "hum") {
      this.stopBeat();
      this.beatGain.gain.setTargetAtTime(0, t, 0.1);
      this.humGain.gain.setTargetAtTime(1, t, force ? 0.001 : 0.4);
    } else if (next === "heartbeat") {
      this.humGain.gain.setTargetAtTime(0.25, t, 0.3);
      this.beatGain.gain.setTargetAtTime(1, t, 0.05);
      this.startBeat();
    }
    this.state = next;
  }

  // Real `offline` event: cut everything to zero instantly, hold exactly 1.0s, resume heartbeat.
  unplug() {
    if (!this.enabled) return;
    const ctx = this.ctx!;
    this.stopBeat();
    this.master.gain.cancelScheduledValues(ctx.currentTime);
    this.master.gain.setValueAtTime(0, ctx.currentTime);
    this.state = "silence";
    if (this.silenceTimer !== null) clearTimeout(this.silenceTimer);
    this.silenceTimer = window.setTimeout(() => {
      this.silenceTimer = null;
      if (!this.muted) this.master.gain.setValueAtTime(1, this.ctx!.currentTime);
      this.state = "heartbeat";
      this.apply("heartbeat", true);
    }, UNPLUG_SILENCE_S * 1000);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.enabled && this.state !== "silence") {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx!.currentTime, 0.02);
    }
  }

  // Plays the committed brake wav for this incident if (and only if) one exists in voice/cache.
  speakBrake(incidentId: string) {
    if (!this.enabled || this.spokenIds.has(incidentId)) return;
    const url = Object.entries(wavUrls).find(([p]) => p.endsWith(`/${incidentId}.wav`))?.[1];
    if (!url) return;
    this.spokenIds.add(incidentId);
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => this.ctx!.decodeAudioData(b))
      .then((audio) => {
        const src = this.ctx!.createBufferSource();
        src.buffer = audio;
        src.connect(this.master);
        src.start();
      })
      .catch(() => this.spokenIds.delete(incidentId));
  }
}

export const soundSpine = new SoundSpine();
