#!/usr/bin/env python3
"""Build the bundled North & Middle America species pack.

Inputs (downloaded separately, see README in this folder):
  ebird_tax.csv  - eBird/Clements taxonomy: https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=csv
  nacc.csv       - AOS NACC checklist:      https://checklist.americanornithology.org/taxa.csv
  tools/data/wiki-info.json (optional) - from fetch_wikipedia_info.py; adds descriptions and images
Output:
  app/assets/data/species-na.json
"""
import csv, json, re, sys, pathlib

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

# Force-include recent eBird splits the checklist does not list separately.
extra_path = pathlib.Path(__file__).resolve().parent / "data/extra-species.json"
if extra_path.exists():
    have = {s["code"] for s in species}
    by_code = {r["SPECIES_CODE"]: r for r in ebird.values()}
    for code in json.loads(extra_path.read_text())["codes"]:
        e = by_code.get(code)
        if e and code not in have:
            species.append({
                "code": e["SPECIES_CODE"], "common": e["COMMON_NAME"], "sci": e["SCIENTIFIC_NAME"],
                "family": e["FAMILY_SCI_NAME"], "familyCommon": e["FAMILY_COM_NAME"], "order": e["ORDER"],
                "sort": float(e["TAXON_ORDER"]), "introduced": False, "hawaii": False,
            })
        elif not e:
            print("WARNING: extra species code not in eBird taxonomy:", code)

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
        img = info.get("image")
        # Some species have no photo, and Wikipedia's lead image is a range map. Skip those.
        if img and not re.search(r"(_map\b|map\.svg|_dist\b|distribution|range_map)", img["url"].split("?")[0], re.I):
            s["image"] = img
            with_img += 1

# Wizard attributes (build_attributes.py) and regional likelihood (fetch_gbif_likelihood.py).
attr_path = pathlib.Path(__file__).resolve().parent / "data/attributes.json"
gbif_path = pathlib.Path(__file__).resolve().parent / "data/gbif-likelihood.json"
with_attr = with_freq = 0
attrs = json.loads(attr_path.read_text()) if attr_path.exists() else {}
gbif = json.loads(gbif_path.read_text()) if gbif_path.exists() else {}
for s in species:
    a = attrs.get(s["code"])
    if a:
        s["sizes"], s["colors"], s["behaviors"] = a["sizes"], a["colors"], a["behaviors"]
        with_attr += 1
    g = gbif.get(s["code"])
    if g:
        s["freq"] = {"usca": g["usca"], "months": g["months"]}
        with_freq += 1

import datetime
pack = {"id": "na", "name": "North & Middle America", "version": 3,
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sources": ["eBird/Clements taxonomy (Cornell Lab of Ornithology)", "AOS NACC checklist (American Ornithological Society)",
                    "Descriptions: Wikipedia (CC BY-SA 4.0)", "Photos: Wikimedia Commons (per-image license)",
                    "Likelihood: GBIF occurrence counts, US and Canada (open data)"],
        "species": species}
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(pack, separators=(",", ":"), ensure_ascii=False))
print(f"wrote {len(species)} species to {out} ({out.stat().st_size//1024} KB); skipped {skipped} accidental/extinct; unmatched {len(unmatched)}; descriptions {with_desc}; images {with_img}; attributes {with_attr}; likelihood {with_freq}")
for u in unmatched[:40]:
    print("  unmatched:", u)
