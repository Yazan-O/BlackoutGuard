# Deterministic smoke test for the situational agent — pure logic, no model, no network, no stub.
# It checks the model-independent contract (which side, near/far, dedup, override, cache short-circuit)
# and never calls Gemma. Real model reasoning is validated by running Gemma itself (local E4B or cloud).
#
#   python3 agent/test_situational.py
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agent import situational


def _info(iid, track_id, cls="pedestrian", bbox=(300, 150, 60, 120)):
    # An info-severity record never triggers advisory generation, so ingest() calls no model.
    return {
        "incident_id": iid, "clip_id": "test", "t_video_s": 0.0, "frame_idx": int(iid.split("-")[-1]),
        "detections": [{"class_name": cls, "confidence": 0.6, "bbox": list(bbox), "track_id": track_id}],
        "rgb_blind": True, "blindness_duration_s": 1.0, "gps": None, "severity": "info",
        "advisory": None, "operator_action": None,
    }


def main():
    situational.CACHE_DIR = Path(tempfile.mkdtemp(prefix="bg-test-cache-"))
    sit = situational.Situation()

    # 1) Contract geometry: side is read from the box's leading (left) edge vs the frame centre (320).
    assert situational._side([152, 0, 0, 0]) == "left"
    assert situational._side([300, 0, 0, 0]) == "left"     # leading edge left of centre, even if box centre isn't
    assert situational._side([400, 0, 0, 0]) == "right"
    assert situational._side([320, 0, 0, 0]) == "center"

    # 2) Proximity: box height >= near-zone threshold => "near".
    assert situational._proximity([0, 0, 0, 151]) == "near"
    assert situational._proximity([0, 0, 0, 100]) == "approaching"

    # 3) Cache short-circuits the model: a pre-seeded line is returned by _advise with no call.
    brake = {**_info("test-000900", 7), "severity": "brake",
             "detections": [{"class_name": "rider", "confidence": 0.74, "bbox": [152, 192, 76, 143], "track_id": 7}]}
    sit._cache_put("test-000900", "Brake — rider, left.")
    assert sit._advise(brake, brake["detections"][0]) == "Brake — rider, left."
    assert sit._cache_get("test-000900") == "Brake — rider, left."

    # 4) Q&A digest deduplicates: the same track_id across frames is ONE road user, not many.
    for i in range(3):
        sit.ingest(_info(f"test-00010{i}", track_id=42))   # three frames, one rider
    sit.ingest(_info("test-000200", track_id=99))          # a second, distinct road user
    digest = sit._digest()
    assert "2 distinct tracked road users" in digest, digest

    # 5) Operator dismiss softens that road-user class for the next similar caution.
    sit.override("test-000200", "dismiss", note=None)
    assert "pedestrian" in sit.softened_classes

    print("OK - situational agent smoke test passed (pure logic, no model, no network)")


if __name__ == "__main__":
    main()
