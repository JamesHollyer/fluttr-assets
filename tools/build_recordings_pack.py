#!/usr/bin/env python3
"""Write the bundled recordings pack. Xeno-canto clips (fetch_xc_recordings.py) come
first because they carry quality grades and reliable song/call types; Wikimedia Commons
clips (fetch_recordings.py) fill each species up to six. Output:
app/assets/data/recordings-na.json."""
import datetime, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
COMMONS = ROOT / "tools/data/recordings.json"
XC = ROOT / "tools/data/xc-recordings.json"
OUT = ROOT / "app/assets/data/recordings-na.json"
MAX_PER_SPECIES = 6
commons = json.loads(COMMONS.read_text()) if COMMONS.exists() else {}
xc = json.loads(XC.read_text()) if XC.exists() else {}
data = {}
for code in set(commons) | set(xc):
    recs = list(xc.get(code) or [])
    for r in commons.get(code) or []:
        if len(recs) >= MAX_PER_SPECIES:
            break
        recs.append(r)
    data[code] = recs
rows = []
for code, recs in data.items():
    for r in recs or []:
        rows.append({"code": code, **{k: v for k, v in r.items() if k != "quality"}})
pack = {"id": "na", "version": 1,
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Xeno-canto and Wikimedia Commons (per-recording license)",
        "recordings": rows}
OUT.write_text(json.dumps(pack, separators=(",", ":"), ensure_ascii=False))
print("wrote %d recordings for %d species (%d KB); from Xeno-canto: %d, Commons: %d" % (
    len(rows), sum(1 for v in data.values() if v), OUT.stat().st_size // 1024,
    sum(1 for r in rows if r["id"].startswith("xc")), sum(1 for r in rows if not r["id"].startswith("xc"))))
