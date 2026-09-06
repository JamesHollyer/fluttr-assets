#!/usr/bin/env python3
"""Fetch regional likelihood for every species from GBIF: the number of
occurrence records in the US and Canada, split by month. GBIF includes the
eBird observation dataset, so these counts track how often birders report
each species. Open data (CC0 / CC BY per dataset).

Reads:  app/assets/data/species-na.json
Writes: tools/data/gbif-likelihood.json  {code: {key, usca, months[12]}}  (resumable)
"""
import json, pathlib, time, urllib.parse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "app/assets/data/species-na.json"
OUT = ROOT / "tools/data/gbif-likelihood.json"
UA = "FluttrSpeciesPackBuilder/0.3 (bird watching app data build; j.c.hollyer@gmail.com)"
API = "https://api.gbif.org/v1/"

def get(path, params):
    url = API + path + "?" + urllib.parse.urlencode(params, doseq=True)
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(3 * (attempt + 1)); continue
            raise
        except Exception:
            time.sleep(2 * (attempt + 1))
    return None

def fetch_one(sp):
    m = get("species/match", {"name": sp["sci"], "kingdom": "Animalia", "class": "Aves"})
    key = (m or {}).get("speciesKey") if m and m.get("matchType") != "NONE" else None
    if not key:
        return sp["code"], {"key": None, "usca": 0, "months": [0] * 12}
    d = get("occurrence/search", {"speciesKey": key, "country": ["US", "CA"], "limit": 0,
                                  "facet": "month", "facetLimit": 12})
    if not d:
        return sp["code"], None
    months = [0] * 12
    for f in d.get("facets", []):
        if f["field"] == "MONTH":
            for c in f["counts"]:
                i = int(c["name"]) - 1
                if 0 <= i < 12:
                    months[i] = c["count"]
    return sp["code"], {"key": key, "usca": d.get("count", 0), "months": months}

def main():
    species = json.loads(PACK.read_text())["species"]
    done = json.loads(OUT.read_text()) if OUT.exists() else {}
    done = {k: v for k, v in done.items() if v}
    todo = [s for s in species if s["code"] not in done]
    print("species: %d, done: %d, to fetch: %d" % (len(species), len(done), len(todo)), flush=True)
    n = 0
    with ThreadPoolExecutor(max_workers=4) as ex:
        for f in as_completed([ex.submit(fetch_one, s) for s in todo]):
            code, rec = f.result()
            if rec:
                done[code] = rec
            n += 1
            if n % 100 == 0:
                OUT.write_text(json.dumps(done))
                print("  %d/%d" % (n, len(todo)), flush=True)
    OUT.write_text(json.dumps(done, indent=0))
    unmatched = sum(1 for r in done.values() if not r.get("key"))
    absent = sum(1 for r in done.values() if r.get("key") and r["usca"] == 0)
    print("done. fetched %d; unmatched in GBIF: %d; zero US/CA records: %d" % (len(done), unmatched, absent), flush=True)

if __name__ == "__main__":
    main()
