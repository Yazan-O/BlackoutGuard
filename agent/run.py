import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # run from any CWD

from agent.situational import Situation


def main():
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
        for rec in (obj if isinstance(obj, list) else [obj]):
            print(json.dumps(sit.ingest(rec), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
