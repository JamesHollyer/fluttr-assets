#!/usr/bin/env python3
"""Write the bundled photos pack from tools/data/inat-photos.json (fetch_inat_photos.py).
Output: app/assets/data/photos-na.json. The Wikipedia lead image stays in the species
pack; these are the extra, sex-labeled photos."""
import datetime, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "tools/data/inat-photos.json"
OUT = ROOT / "app/assets/data/photos-na.json"
data = json.loads(SRC.read_text()) if SRC.exists() else {}
rows = [{"code": code, **p} for code, photos in data.items() for p in (photos or [])]
pack = {"id": "na", "version": 1, "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "iNaturalist (per-photo license)", "photos": rows}
OUT.write_text(json.dumps(pack, separators=(",", ":"), ensure_ascii=False))
print("wrote %d photos for %d species (%d KB)" % (len(rows), sum(1 for v in data.values() if v), OUT.stat().st_size // 1024))
