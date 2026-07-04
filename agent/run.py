import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # run from any CWD

from agent.gemma_adapter import GEMMA_MODEL
from agent.situational import Situation

FIXTURES = Path(__file__).resolve().parent.parent / "contracts" / "fixtures"


class Agent:
    def __init__(self):
        self.sit = Situation()
        self.loaded = {}  # incident_id -> advisory-filled record; keeps /advisory idempotent
        self._preload()

    def _preload(self):
        for fp in sorted(FIXTURES.glob("*.json")):
            try:
                records = json.loads(fp.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as e:
                print(f"[agent] skip {fp.name}: {e}", file=sys.stderr)
                continue
            for rec in records if isinstance(records, list) else [records]:
                try:
                    self._ingest(rec)
                except Exception as e:  # a Gemma/Ollama hiccup must not stop the server binding
                    print(f"[agent] preload {rec.get('incident_id')}: {e}", file=sys.stderr)

    def _ingest(self, rec):
        iid = rec.get("incident_id")
        if iid in self.loaded:
            return self.loaded[iid]
        filled = self.sit.ingest(rec)
        if iid is not None:
            self.loaded[iid] = filled
        return filled

    def advisory(self, body):
        if isinstance(body, dict) and "records" in body:
            records = body["records"]
        elif isinstance(body, list):
            records = body
        else:
            records = [body]
        return {"records": [self._ingest(r) for r in records]}

    def ask(self, body):
        return {"answer": self.sit.ask(body["question"])}

    def action(self, body):
        op = body["operator_action"]
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
            return self._json(200, {"ok": True, "model": GEMMA_MODEL, "incidents": len(self.agent.loaded)})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError as e:
            return self._json(400, {"error": f"bad json: {e}"})
        path = self.path.split("?")[0]
        route = {"/advisory": self.agent.advisory, "/ask": self.agent.ask, "/action": self.agent.action}.get(path)
        if route is None:
            return self._json(404, {"error": "not found"})
        try:
            self._json(200, route(body))
        except Exception as e:  # Ollama down / bad request -> loud error, never a fabricated advisory
            self._json(502, {"error": f"{type(e).__name__}: {e}"})

    def log_message(self, *_):
        pass


def serve(port):
    Handler.agent = Agent()
    httpd = HTTPServer(("127.0.0.1", port), Handler)
    print(f"[agent] serving http://127.0.0.1:{port}  model={GEMMA_MODEL}  incidents={len(Handler.agent.loaded)}",
          flush=True)
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
