import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # run from any CWD

from agent.gemma_adapter import GEMMA_MODEL
from agent.situational import Situation

FIXTURES = Path(__file__).resolve().parent.parent / "contracts" / "fixtures"
ACTIVE_CLIP = os.environ.get("AGENT_CLIP", "clip_zc09a")  # preloaded clip; others load on demand via /advisory


class Agent:
    def __init__(self):
        self.sit = Situation()
        self.loaded = {}                 # incident_id -> filled record; keeps /advisory idempotent
        self.lock = threading.Lock()     # one mutable Situation; serialize the background preload vs requests
        self.ready = False

    def preload(self, clip=ACTIVE_CLIP):
        fp = FIXTURES / f"{clip}.json"
        if not fp.exists():
            print(f"[agent] preload: {fp.name} not found", file=sys.stderr)
            self.ready = True
            return
        try:
            records = json.loads(fp.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            print(f"[agent] preload skip {fp.name}: {e}", file=sys.stderr)
            records = []
        for rec in records if isinstance(records, list) else [records]:
            try:
                self._ingest(rec)
            except Exception as e:  # a Gemma/Ollama hiccup on one record must not stop the rest
                print(f"[agent] preload {rec.get('incident_id')}: {e}", file=sys.stderr)
        self.ready = True
        print(f"[agent] preload done: {len(self.loaded)} incidents from {clip}", file=sys.stderr)

    def _ingest(self, rec, force=False):
        iid = rec.get("incident_id")
        with self.lock:
            if iid in self.loaded and not force:
                return self.loaded[iid]
            # force re-advises an already-ingested incident in place (post-override softening) instead of
            # re-appending it; a genuinely new incident is ingested normally. self.loaded stays current.
            filled = self.sit.re_advise(iid) if (force and iid in self.loaded) else self.sit.ingest(rec)
            if iid is not None and filled is not None:
                self.loaded[iid] = filled
            return filled

    def advisory(self, body):
        force = isinstance(body, dict) and bool(body.get("force"))
        if isinstance(body, dict) and "records" in body:
            records = body["records"]
        elif isinstance(body, list):
            records = body
        else:
            records = [body]
        return {"records": [self._ingest(r, force) for r in records]}

    def ask(self, body):
        with self.lock:
            return {"answer": self.sit.ask(body["question"])}

    def action(self, body):
        op = body["operator_action"]
        with self.lock:
            self.sit.override(body["incident_id"], op["action"], op.get("note"))
        return {"ok": True, "incident_id": body["incident_id"], "action": op["action"]}


class Handler(BaseHTTPRequestHandler):
    agent = None

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")

    def _json(self, code, obj):
        payload = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self._cors()
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/health":
            a = self.agent
            return self._json(200, {"ok": True, "model": GEMMA_MODEL, "incidents": len(a.loaded), "ready": a.ready})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?")[0]
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if path == "/stt":  # raw audio bytes in, transcript out — not JSON
            return self._stt(raw)
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError as e:
            return self._json(400, {"error": f"bad json: {e}"})
        if path == "/ask" and body.get("stream"):  # opt-in; the non-stream /ask below is unchanged
            return self._ask_stream(body.get("question", ""))
        if path == "/speak":  # text in, audio/wav out — not JSON
            return self._speak(body.get("text", ""))
        route = {"/advisory": self.agent.advisory, "/ask": self.agent.ask, "/action": self.agent.action}.get(path)
        if route is None:
            return self._json(404, {"error": "not found"})
        try:
            self._json(200, route(body))
        except Exception as e:  # Ollama down / bad request -> loud error, never a fabricated advisory
            self._json(502, {"error": f"{type(e).__name__}: {e}"})

    def _stt(self, raw):
        # On-device whisper via voice/stt_iface, imported lazily so a missing model breaks only /stt, not
        # the server. A failure is a loud 502 and the app stays on typed Q&A — never a fabricated transcript.
        if not raw:
            return self._json(400, {"error": "empty audio body"})
        ct = (self.headers.get("Content-Type") or "").lower()
        suffix = ".wav" if "wav" in ct else ".ogg" if "ogg" in ct else ".webm"
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        try:
            tmp.write(raw)
            tmp.close()
            from voice import stt_iface
            return self._json(200, {"text": stt_iface.transcribe(tmp.name)})
        except Exception as e:  # whisper missing / decode fail -> loud, honest
            return self._json(502, {"error": f"{type(e).__name__}: {e}"})
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass

    def _speak(self, text):
        # Live Piper synthesis of an answer via voice/voice_iface (offline, on-device). Missing Piper/voice
        # model -> loud 502; the app shows the typed answer, just unspoken (never a faked spoken line).
        text = (text or "").strip()
        if not text:
            return self._json(400, {"error": "empty text"})
        try:
            from voice import voice_iface
            data = Path(voice_iface.speak(text)).read_bytes()
        except Exception as e:
            return self._json(502, {"error": f"{type(e).__name__}: {e}"})
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _ask_stream(self, question):
        # Streamed /ask: NDJSON, one {"delta": "..."} per real token, then {"done": true}. Headers commit
        # before the first token, so a mid-stream backend failure lands as a trailing {"error": ...} line
        # (never a fabricated token). Held under the agent lock — one mutable Situation, serialized.
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        a = self.agent
        try:
            with a.lock:
                for piece in a.sit.ask_stream(question):
                    self.wfile.write((json.dumps({"delta": piece}, ensure_ascii=False) + "\n").encode("utf-8"))
                    self.wfile.flush()
            self.wfile.write(b'{"done": true}\n')
            self.wfile.flush()
        except Exception as e:  # Ollama down mid-stream -> loud trailing error, honest degrade on the client
            try:
                self.wfile.write((json.dumps({"error": f"{type(e).__name__}: {e}"}) + "\n").encode("utf-8"))
                self.wfile.flush()
            except OSError:
                pass

    def log_message(self, *_):
        pass


def serve(port):
    Handler.agent = Agent()
    httpd = HTTPServer(("127.0.0.1", port), Handler)  # binds the socket now, before any preload
    print(f"[agent] serving http://127.0.0.1:{port}  model={GEMMA_MODEL}  (preloading {ACTIVE_CLIP} in background)",
          flush=True)
    threading.Thread(target=Handler.agent.preload, daemon=True).start()
    httpd.serve_forever()


def replay():
    sit = Situation()
    buf = ""
    for line in sys.stdin:
        s = line.strip()
        if not buf and not s:
            continue
        if not buf and s.startswith("ASK:"):
            print(sit.ask(s[4:].strip()), flush=True)
            continue
        if not buf and s.startswith("OVERRIDE:"):
            parts = s[len("OVERRIDE:"):].strip().split(maxsplit=2)
            sit.override(parts[0], parts[1], parts[2] if len(parts) > 2 else None)
            print(json.dumps({"ack": "override", "incident_id": parts[0], "action": parts[1]}), flush=True)
            continue
        buf += line
        try:
            obj = json.loads(buf)
        except json.JSONDecodeError:
            continue
        buf = ""
        for rec in obj if isinstance(obj, list) else [obj]:
            print(json.dumps(sit.ingest(rec), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    if "--replay" in sys.argv[1:]:
        replay()
    else:
        serve(int(os.environ.get("AGENT_PORT", "8000")))
