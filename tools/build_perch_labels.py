#!/usr/bin/env python3
"""Write the Perch v2 class list (eBird codes, in output order) as a JSON asset
for the app. Reads tools/models/perch_v2_ebird_classes.csv from the Perch
Hugging Face mirror (Apache 2.0)."""
import csv, json, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
rows = list(csv.reader(open(ROOT / "tools/models/perch_v2_ebird_classes.csv")))
codes = [r[0] for r in rows[1:]]
out = ROOT / "app/assets/data/perch-v2-labels.json"
out.write_text(json.dumps({"model": "perch_v2", "classes": codes}, separators=(",", ":")))
pack = {s["code"] for s in json.load(open(ROOT / "app/assets/data/species-na.json"))["species"]}
print("classes: %d; in our pack: %d of %d pack species (%d KB)" % (len(codes), len(pack & set(codes)), len(pack), out.stat().st_size // 1024))
