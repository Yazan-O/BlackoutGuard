# Event-built for RAISE Summit (Gemma-Edge track). Gemma 4 open weights via local Ollama are a
# disclosed tool; the situational state, fact derivation, advisory/Q&A prompts and override feedback are ours.
import json
from datetime import datetime
from pathlib import Path

from agent.gemma_adapter import generate, stream

EVENT_FRAME_W = 640      # DSEC event frame is 640x480 (perception lane)
NEAR_ZONE_H = 130        # perception's near/far discriminator: box height in px
SOFTEN_CONF_MAX = 0.80   # only genuinely low-confidence cautions are eligible to soften
_SEV_RANK = {"info": 0, "caution": 1, "brake": 2}

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
        self.softened_at = {}       # class_name -> {iso, hhmm} of the dismissal that softened it
        self.softened_cache = {}    # incident_id -> softened advisory (in-memory; base cache untouched)
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
        sev, cls, conf = record["severity"], det["class_name"], det["confidence"]
        # A dismissal softens later low-confidence cautions of that class. That path skips the base
        # advisory cache (seeded before any override) so the line genuinely changes; the softened text
        # is kept in memory for this run and the record carries the agent's own audit annotation.
        soften = sev != "brake" and cls in self.softened_classes and conf < SOFTEN_CONF_MAX
        if soften and incident_id in self.softened_cache:
            self._annotate_softened(record, cls)
            return self.softened_cache[incident_id]
        if not soften:
            cached = self._cache_get(incident_id)
            if cached is not None:
                return cached
        facts = (f"Severity: {sev}. {cls.capitalize()}, {_side(det['bbox'])}, {_proximity(det['bbox'])} zone, "
                 f"confidence {conf:.2f}. RGB camera blind {record['blindness_duration_s']:.1f}s; event camera "
                 f"still sees the {cls}.")
        user = facts + " Write the advisory."
        if soften:
            user += (f" Operator just dismissed a similar low-confidence {cls} caution as a false alarm. "
                     "Downgrade the action word to 'Note' (not 'Caution'), keep it low-key, and add 'low confidence'.")
        advisory = generate([{"role": "system", "content": ADVISORY_SYSTEM},
                             {"role": "user", "content": user}], temperature=0.2, max_tokens=48).strip()
        if soften:
            self.softened_cache[incident_id] = advisory
            self.corrections.append({"incident_id": incident_id, "softened": cls})
            self._annotate_softened(record, cls)
        else:
            self._cache_put(incident_id, advisory)
        return advisory

    def _annotate_softened(self, record, cls):
        # The audit trail is the agent's, not the UI's: stamp the record with the dismissal that softened
        # it and its real time. The client shows record["softened"]["note"] verbatim (never hand-written).
        at = self.softened_at.get(cls)
        record["softened"] = {
            "class": cls,
            "corrected_at": at["iso"] if at else None,
            "note": f"downgraded — you corrected me at {at['hhmm']}" if at else "downgraded",
        }

    def re_advise(self, incident_id):
        # Re-run advisory for an already-ingested incident in place (no duplicate log entry) — used after
        # an override so a later similar caution really reflects the correction. Returns the record.
        for r in self.log:
            if r["incident_id"] == incident_id:
                det = r["detections"][0] if r["detections"] else None
                if det is not None and r["severity"] in ("caution", "brake"):
                    r["advisory"] = self._advise(r, det)
                return r
        return None

    def ask(self, question):
        user = f"Log digest:\n{self._digest()}\nQuestion: {question}"
        return generate([{"role": "system", "content": ASK_SYSTEM},
                         {"role": "user", "content": user}], temperature=0.2, max_tokens=256).strip()

    def ask_stream(self, question):
        # Same reasoning as ask(), streamed: returns a generator of content deltas over the SAME digest,
        # so the token stream the console shows is Gemma's real output, not a replay of a finished string.
        user = f"Log digest:\n{self._digest()}\nQuestion: {question}"
        return stream([{"role": "system", "content": ASK_SYSTEM},
                       {"role": "user", "content": user}], temperature=0.2, max_tokens=256)

    def _digest(self):
        # Summarize the WHOLE session by tracked road user (dedup track_id), not just the last N raw
        # frames — so whole-night questions ("how many times was I blinded near a pedestrian") see it all.
        tracks = {}
        for r in self.log:
            det = r["detections"][0] if r["detections"] else None
            if det is None or det.get("track_id") is None:
                continue
            t = tracks.setdefault(det["track_id"], {"cls": det["class_name"], "first": r["t_video_s"],
                "last": r["t_video_s"], "frames": 0, "blind": 0, "sev": "info", "conf": det["confidence"]})
            t["frames"] += 1
            t["last"] = r["t_video_s"]
            t["blind"] += 1 if r["rgb_blind"] else 0
            if _SEV_RANK[r["severity"]] > _SEV_RANK[t["sev"]]:
                t["sev"] = r["severity"]
        lines = []
        for tid, t in sorted(tracks.items(), key=lambda kv: kv[1]["first"]):
            seen = "RGB-blind" if t["blind"] else "RGB visible"
            lines.append(f"- road user {tid}: {t['cls']}, t={t['first']:.1f}-{t['last']:.1f}s, peak {t['sev']}, "
                         f"conf~{t['conf']:.2f}, {t['blind']}/{t['frames']} frames while {seen}")
        peds = sorted(tid for tid, t in tracks.items() if t["cls"] == "pedestrian" and t["blind"])
        riders = sorted(tid for tid, t in tracks.items() if t["cls"] == "rider" and t["blind"])
        brakes = sorted(tid for tid, t in tracks.items() if t["sev"] == "brake")
        lines.append(f"(session totals: {len(tracks)} distinct road users. Seen WHILE the RGB camera was "
                     f"blind: {len(peds)} pedestrians (road users {peds}), {len(riders)} riders (road users "
                     f"{riders}). Brakes triggered: {len(brakes)} (road users {brakes}).)")
        return "\n".join(lines)

    def override(self, incident_id, action, note=None):
        now = datetime.now().astimezone()   # real wall-clock of the correction — the audit timestamp
        op = {"action": action, "note": note, "t_utc": now.isoformat(timespec="seconds")}
        self.overrides[incident_id] = op
        for r in self.log:
            if r["incident_id"] == incident_id:
                r["operator_action"] = op
                det = r["detections"][0] if r["detections"] else None
                if action == "dismiss" and det is not None:
                    cls = det["class_name"]
                    self.softened_classes.add(cls)
                    self.softened_at[cls] = {"iso": op["t_utc"], "hhmm": now.strftime("%H:%M")}
                    self.corrections.append({"override": incident_id, "dismiss_class": cls})
                break
        return op
