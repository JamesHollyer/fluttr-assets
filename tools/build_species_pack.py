#!/usr/bin/env python3
"""Build the bundled North & Middle America species pack.

Inputs (downloaded separately, see README in this folder):
  ebird_tax.csv  - eBird/Clements taxonomy: https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=csv
  nacc.csv       - AOS NACC checklist:      https://checklist.americanornithology.org/taxa.csv
  tools/data/wiki-info.json (optional) - from fetch_wikipedia_info.py; adds descriptions and images
Output:
  app/assets/data/species-na.json
"""
import csv, json, sys, pathlib

src = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(".")
out = pathlib.Path(__file__).resolve().parent.parent / "app/assets/data/species-na.json"

ebird = {}
with open(src / "ebird_tax.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        if r["CATEGORY"] != "species":
            continue
        ebird[r["SCIENTIFIC_NAME"].strip().lower()] = r
ebird_by_common = {r["COMMON_NAME"].strip().lower(): r for r in ebird.values()}

species, unmatched, skipped = [], [], 0
with open(src / "nacc.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        if r["rank"] != "species":
            continue
        if r["status_accidental"] or r["status_extinct"] or r["status_misplaced"]:
            skipped += 1
            continue
        sci = r["species"].strip()
        e = ebird.get(sci.lower()) or ebird_by_common.get(r["common_name"].strip().lower())
        if not e:
            unmatched.append(f'{r["common_name"]} ({sci})')
            continue
        species.append({
            "code": e["SPECIES_CODE"],
            "common": e["COMMON_NAME"],
            "sci": e["SCIENTIFIC_NAME"],
            "family": e["FAMILY_SCI_NAME"],
            "familyCommon": e["FAMILY_COM_NAME"],
            "order": e["ORDER"],
            "sort": float(e["TAXON_ORDER"]),
            "introduced": bool(r["status_introduced"]),
            "hawaii": bool(r["status_hawaiian"]),
        })

species.sort(key=lambda s: s["sort"])

# Merge Wikipedia descriptions and Commons images when the fetch has been run.
wiki_path = pathlib.Path(__file__).resolve().parent / "data/wiki-info.json"
with_desc = with_img = 0
if wiki_path.exists():
    wiki = json.loads(wiki_path.read_text())
    for s in species:
        info = wiki.get(s["code"])
        if not info:
            continue
        if info.get("description"):
            s["description"] = info["description"]
            s["wikiUrl"] = info.get("wikiUrl")
            with_desc += 1
        if info.get("image"):
            s["image"] = info["image"]
            with_img += 1

pack = {"id": "na", "name": "North & Middle America", "version": 2,
        "sources": ["eBird/Clements taxonomy (Cornell Lab of Ornithology)", "AOS NACC checklist (American Ornithological Society)",
                    "Descriptions: Wikipedia (CC BY-SA 4.0)", "Photos: Wikimedia Commons (per-image license)"],
        "species": species}
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(pack, separators=(",", ":"), ensure_ascii=False))
print(f"wrote {len(species)} species to {out} ({out.stat().st_size//1024} KB); skipped {skipped} accidental/extinct; unmatched {len(unmatched)}; descriptions {with_desc}; images {with_img}")
for u in unmatched[:40]:
    print("  unmatched:", u)
