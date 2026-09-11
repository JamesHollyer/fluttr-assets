#!/usr/bin/env python3
"""Fetch sex-labeled photos per species from iNaturalist: research-grade observations
annotated Male or Female, Creative Commons photos only, most-voted first. Two of each
sex when available, plus adult photos of unknown sex to fill.

Reads:  app/assets/data/species-na.json
Writes: tools/data/inat-photos.json  {code: [photo, ...]}  (resumable)
"""
import json, pathlib, threading, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "app/assets/data/species-na.json"
OUT = ROOT / "tools/data/inat-photos.json"
UA = "FluttrSpeciesPackBuilder/0.3 (bird watching app data build; j.c.hollyer@gmail.com)"
API = "https://api.inaturalist.org/v1/observations"
DELAY = 1.05          # iNaturalist asks for at most ~60 requests/minute (shared across workers)
WORKERS = 2
_lock = threading.Lock()
_last = [0.0]
LICENSES = "cc-by,cc-by-sa,cc-by-nc,cc-by-nc-sa,cc0"
PER_SEX = 2
SEX_TERM, FEMALE, MALE = 9, 10, 11
STAGE_TERM, ADULT = 1, 2
LICENSE_NAMES = {"cc-by": "CC BY", "cc-by-sa": "CC BY-SA", "cc-by-nc": "CC BY-NC", "cc-by-nc-sa": "CC BY-NC-SA", "cc0": "CC0"}


def get(params):
    with _lock:
        wait = DELAY - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(20 * (attempt + 1)); continue
            raise
        except Exception:
            time.sleep(3 * (attempt + 1))
    return {}


def photo_from(o, sex):
    p = (o.get("photos") or [None])[0]
    if not p or not p.get("url") or not p.get("license_code"):
        return None
    dims = p.get("original_dimensions") or {}
    return {
        "id": "inat%s" % p["id"],
        "sex": sex,
        "url": p["url"].replace("/square.", "/medium."),
        "width": dims.get("width"),
        "height": dims.get("height"),
        "attribution": p.get("attribution"),
        "license": LICENSE_NAMES.get(p["license_code"], p["license_code"].upper()),
        "page": "https://www.inaturalist.org/observations/%s" % o["id"],
    }


def observation_sex(o):
    for a in o.get("annotations") or []:
        if a.get("controlled_attribute_id") == SEX_TERM:
            return {MALE: "male", FEMALE: "female"}.get(a.get("controlled_value_id"))
    return None


def query_sexed(sci):
    """One request for both sexes; the sex comes from each observation's annotations."""
    d = get({"taxon_name": sci, "quality_grade": "research", "photo_license": LICENSES, "photos": "true",
             "order_by": "votes", "per_page": 30, "term_id": SEX_TERM, "term_value_id": "%d,%d" % (FEMALE, MALE)})
    out, per_sex, seen_users = [], {"male": 0, "female": 0}, set()
    for o in d.get("results", []):
        sex = observation_sex(o)
        if not sex or per_sex[sex] >= PER_SEX:
            continue
        user = (o.get("user") or {}).get("login")
        if user in seen_users:
            continue
        photo = photo_from(o, sex)
        if not photo:
            continue
        seen_users.add(user)
        per_sex[sex] += 1
        out.append(photo)
        if per_sex["male"] >= PER_SEX and per_sex["female"] >= PER_SEX:
            break
    return out


def query_adults(sci, n):
    d = get({"taxon_name": sci, "quality_grade": "research", "photo_license": LICENSES, "photos": "true",
             "order_by": "votes", "per_page": n * 2, "term_id": STAGE_TERM, "term_value_id": ADULT})
    out, seen_users = [], set()
    for o in d.get("results", []):
        user = (o.get("user") or {}).get("login")
        if user in seen_users:
            continue
        photo = photo_from(o, "unknown")
        if not photo:
            continue
        seen_users.add(user)
        out.append(photo)
        if len(out) >= n:
            break
    return out


def main():
    species = json.loads(PACK.read_text())["species"]
    done = json.loads(OUT.read_text()) if OUT.exists() else {}
    todo = [s for s in species if s["code"] not in done]
    print("species: %d, done: %d, to fetch: %d" % (len(species), len(done), len(todo)), flush=True)
    def work(s):
        photos = query_sexed(s["sci"])
        if len(photos) < 2:
            photos += query_adults(s["sci"], 3 - len(photos))
        return s["code"], photos

    n = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
      for fut in as_completed([ex.submit(work, s) for s in todo]):
        code, photos = fut.result()
        done[code] = photos
        n += 1
        if n % 100 == 0:
            OUT.write_text(json.dumps(done, ensure_ascii=False))
            both = sum(1 for v in done.values() if {p["sex"] for p in v} >= {"male", "female"})
            print("  %d/%d  (species with both sexes so far: %d)" % (n, len(todo), both), flush=True)
    OUT.write_text(json.dumps(done, ensure_ascii=False, indent=0))
    both = sum(1 for v in done.values() if {p["sex"] for p in v} >= {"male", "female"})
    print("done. species with any photo: %d; with both sexes: %d; photos: %d" % (
        sum(1 for v in done.values() if v), both, sum(len(v) for v in done.values())), flush=True)


if __name__ == "__main__":
    main()
