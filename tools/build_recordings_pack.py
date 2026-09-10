#!/usr/bin/env python3
"""Write the bundled recordings pack from tools/data/recordings.json
(fetch_recordings.py). Output: app/assets/data/recordings-na.json."""
import datetime, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "tools/data/recordings.json"
OUT = ROOT / "app/assets/data/recordings-na.json"
data = json.loads(SRC.read_text()) if SRC.exists() else {}
rows = []
for code, recs in data.items():
    for r in recs or []:
        rows.append({"code": code, **r})
pack = {"id": "na", "version": 1,
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Wikimedia Commons (per-recording license; many are Xeno-canto mirrors)",
        "recordings": rows}
OUT.write_text(json.dumps(pack, separators=(",", ":"), ensure_ascii=False))
print("wrote %d recordings for %d species (%d KB)" % (len(rows), sum(1 for v in data.values() if v), OUT.stat().st_size // 1024))
