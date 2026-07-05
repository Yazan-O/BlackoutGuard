import { soundSpine } from "./audio";

// Voice loop, all on-device: mic capture -> the bridge's local whisper (/stt) -> transcript, and the
// answer spoken by the bridge's local Piper (/speak). Every failure (no agent, mic denied, STT/Piper
// model missing) resolves to null/false so the console falls back to typed Q&A — never a faked
// transcript or a faked spoken line. Loopback only; nothing leaves the machine.
const BASE = import.meta.env.VITE_AGENT_URL as string | undefined;

export function micSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export interface Recording {
  stop: () => Promise<string | null>; // stop, transcribe on-device, resolve the text (or null on any failure)
  cancel: () => void;
}

export async function startRecording(): Promise<Recording | null> {
  if (!BASE || !micSupported()) return null;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return null; // mic denied or unavailable
  }
  const rec = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());

  return {
    stop: () =>
      new Promise<string | null>((resolve) => {
        if (rec.state === "inactive") {
          release();
          return resolve(null);
        }
        rec.onstop = async () => {
          release();
          resolve(await transcribe(new Blob(chunks, { type: rec.mimeType || "audio/webm" })));
        };
        rec.stop();
      }),
    cancel: () => {
      if (rec.state !== "inactive") rec.stop();
      release();
    },
  };
}

async function transcribe(blob: Blob): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/stt`, {
      method: "POST",
      headers: { "content-type": blob.type || "audio/webm" },
      body: blob,
    });
    if (!res.ok) return null; // STT model missing / decode fail -> honest null
    const data = await res.json();
    const text = typeof data.text === "string" ? data.text.trim() : "";
    return text || null;
  } catch {
    return null;
  }
}

// Speak text through the bridge's local Piper and play it on the shared sound spine. Resolves false if
// the agent is absent or the Piper model is missing — the console still shows the typed answer, unspoken.
export async function speak(text: string): Promise<boolean> {
  if (!BASE || !text.trim()) return false;
  try {
    const res = await fetch(`${BASE}/speak`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return false;
    return await soundSpine.playClip(await res.arrayBuffer());
  } catch {
    return false;
  }
}
