# Event-built for RAISE Summit (Gemma-Edge track). Gemma 4 open weights via local Ollama are a
# disclosed tool; the situational state, fact derivation, advisory/Q&A prompts and override feedback are ours.
import json
from pathlib import Path

from agent.gemma_adapter import generate

EVENT_FRAME_W = 640      # DSEC event frame is 640x480 (perception lane)
NEAR_ZONE_H = 130        # perception's near/far discriminator: box height in px
SOFTEN_CONF_MAX = 0.80   # only genuinely low-confidence cautions are eligible to soften

_AGENT_DIR = Path(__file__).resolve().parent
_ROOT = _AGENT_DIR.parent
CACHE_DIR = (_ROOT / "cache") if (_ROOT / "cache").is_dir() else (_AGENT_DIR / "cache")

ADVISORY_SYSTEM = (
    "You are BlackoutGuard, a terse in-vehicle safety voice. Output ONE imperative line of 12 words "
    "or fewer, in sentence case (never all capitals), no preamble, no markdown, no quotes. Use only the "
    "facts given; never mention an object that is not listed. Format: '<Action> — <hazard>, <side>.' "
    "Set the action word from severity: brake -> 'Brake', caution -> 'Caution', info -> 'Note'."
)

ASK_SYSTEM = (
    "You are BlackoutGuard's situational agent. Reason over the incident log and answer the operator in "
    "1-3 sentences. The same track_id across frames is ONE road user, not many — deduplicate before you "
    "count. Separate flagged frames from distinct road users, and mention the RGB-blind window when it "
    "matters. Be concrete and do not invent incidents beyond the log."
)


def _side(bbox):
    # Side is read from the box's leading (left) edge against the frame centre, per the contract: a
    # near-zone VRU box straddles the centreline, so x=300 on a 640px frame is "left" even though its
    # centre (326) sits a hair right of 320.
    x = bbox[0]
    mid = EVENT_FRAME_W / 2
    if x < mid:
        return "left"
    if x > mid:
        return "right"
    return "center"


def _proximity(bbox):
    return "near" if bbox[3] >= NEAR_ZONE_H else "approaching"


class Situation:
    def __init__(self):
        self.tracks = {}            # track_id -> live view of one road user
        self.log = []               # ordered incident records, advisory filled in place
        self.blind = {"rgb_blind": False, "duration_s": 0.0}
        self.overrides = {}         # incident_id -> operator_action
        self.softened_classes = set()
        self.corrections = []       # audit trail of applied overrides / softenings
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, incident_id):
        return CACHE_DIR / f"{incident_id}.txt"

    def _cache_get(self, incident_id):
        p = self._cache_path(incident_id)
        return p.read_text(encoding="utf-8").strip() if p.exists() else None

    def _cache_put(self, incident_id, advisory):
        self._cache_path(incident_id).write_text(advisory + "\n", encoding="utf-8")

    def ingest(self, record):
        det = record["detections"][0] if record["detections"] else None
        self.blind = {"rgb_blind": record["rgb_blind"], "duration_s": record["blindness_duration_s"]}
        if det is not None and det.get("track_id") is not None:
            t = self.tracks.setdefault(det["track_id"], {"first_t": record["t_video_s"], "count": 0})
            t.update(class_name=det["class_name"], confidence=det["confidence"],
                     side=_side(det["bbox"]), severity=record["severity"], last_t=record["t_video_s"])
            t["count"] += 1
        self.log.append(record)
        if record["severity"] in ("caution", "brake") and det is not None:
            record["advisory"] = self._advise(record, det)
        return record

    def _advise(self, record, det):
        incident_id = record["incident_id"]
        cached = self._cache_get(incident_id)
        if cached is not None:
            return cached
        sev, cls, conf = record["severity"], det["class_name"], det["confidence"]
        facts = (f"Severity: {sev}. {cls.capitalize()}, {_side(det['bbox'])}, {_proximity(det['bbox'])} zone, "
                 f"confidence {conf:.2f}. RGB camera blind {record['blindness_duration_s']:.1f}s; event camera "
                 f"still sees the {cls}.")
        user = facts + " Write the advisory."
        if sev != "brake" and cls in self.softened_classes and conf < SOFTEN_CONF_MAX:
            user += (f" Operator just dismissed a similar low-confidence {cls} caution as a false alarm. "
                     "Downgrade the action word to 'Note' (not 'Caution'), keep it low-key, and add 'low confidence'.")
            self.corrections.append({"incident_id": incident_id, "softened": cls})
        advisory = generate([{"role": "system", "content": ADVISORY_SYSTEM},
                             {"role": "user", "content": user}], temperature=0.2, max_tokens=48).strip()
        self._cache_put(incident_id, advisory)
        return advisory

    def ask(self, question):
        user = f"Log digest:\n{self._digest()}\nQuestion: {question}"
        return generate([{"role": "system", "content": ASK_SYSTEM},
                         {"role": "user", "content": user}], temperature=0.2, max_tokens=256).strip()

    def _digest(self, limit=20):
        rows = self.log[-limit:]
        lines = []
        for r in rows:
            det = r["detections"][0] if r["detections"] else None
            cls = det["class_name"] if det else "none"
            tid = det["track_id"] if det else None
            conf = det["confidence"] if det else 0.0
            lines.append(f"- {r['incident_id']}  t={r['t_video_s']:.2f}s  {cls}  track={tid}  "
                         f"conf={conf:.2f}  rgb_blind={str(r['rgb_blind']).lower()}  severity={r['severity']}")
        tracked = {det["track_id"] for r in rows
                   for det in ([r["detections"][0]] if r["detections"] else [])
                   if det.get("track_id") is not None}
        lines.append(f"({len(rows)} flagged frames, {len(tracked)} distinct tracked road users)")
        return "\n".join(lines)

    def override(self, incident_id, action, note=None):
        op = {"action": action, "note": note, "t_utc": None}
        self.overrides[incident_id] = op
        for r in self.log:
            if r["incident_id"] == incident_id:
                r["operator_action"] = op
                det = r["detections"][0] if r["detections"] else None
                if action == "dismiss" and det is not None:
                    self.softened_classes.add(det["class_name"])
                    self.corrections.append({"override": incident_id, "dismiss_class": det["class_name"]})
                break
