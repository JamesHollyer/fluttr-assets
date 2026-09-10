#!/usr/bin/env python3
"""Fetch songs and calls per species from Xeno-canto (API v3, needs a key in tools/.env
as XC_API_KEY). Keeps MP3 originals only (some uploads are WAV, far too big to stream),
quality C or better, 3 to 120 seconds, up to six per species mixing songs and calls.

Reads:  app/assets/data/species-na.json
Writes: tools/data/xc-recordings.json  {code: [recording, ...]}  (resumable)
"""
import json, pathlib, re, time, urllib.error, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "app/assets/data/species-na.json"
OUT = ROOT / "tools/data/xc-recordings.json"
ENV = ROOT / "tools/.env"
UA = "FluttrSpeciesPackBuilder/0.3 (bird watching app data build; j.c.hollyer@gmail.com)"
DELAY = 1.0
MAX_PER_SPECIES = 6
PER_KIND = 3

LICENSE_NAMES = {
    "by-nc-sa": "CC BY-NC-SA", "by-nc-nd": "CC BY-NC-ND", "by-nc": "CC BY-NC",
    "by-sa": "CC BY-SA", "by-nd": "CC BY-ND", "by": "CC BY", "zero": "CC0", "publicdomain": "Public domain",
}


def api_key():
    for line in ENV.read_text().splitlines():
        if line.startswith("XC_API_KEY="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("XC_API_KEY missing from tools/.env")


def query(q, key):
    url = "https://xeno-canto.org/api/3/recordings?" + urllib.parse.urlencode({"query": q, "key": key, "per_page": 100})
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(15 * (attempt + 1)); continue
            raise
        except Exception:
            time.sleep(3 * (attempt + 1))
    return {}


def seconds(length):
    parts = [int(p) for p in length.split(":")]
    return parts[0] * 60 + parts[1] if len(parts) == 2 else parts[0] * 3600 + parts[1] * 60 + parts[2]


def license_name(url):
    m = re.search(r"licenses/([a-z-]+)/(\d\.\d)", url or "")
    if m:
        return "%s %s" % (LICENSE_NAMES.get(m.group(1), m.group(1).upper()), m.group(2))
    if "publicdomain" in (url or ""):
        return "Public domain"
    return None


def classify(t):
    t = (t or "").lower()
    if "song" in t: return "song"
    if "alarm" in t: return "alarm"
    if "flight" in t: return "flight"
    if "drum" in t: return "drum"
    if "call" in t: return "call"
    return "sound"


def to_recording(r):
    if not r.get("file-name", "").lower().endswith(".mp3"):
        return None
    return {
        "id": "xc" + r["id"],
        "title": "XC%s %s" % (r["id"], r.get("en", "")),
        "kind": classify(r.get("type")),
        "url": r["file"],
        "duration": float(seconds(r["length"])),
        "quality": r.get("q"),
        "recordist": r.get("rec"),
        "license": license_name(r.get("lic")),
        "licenseUrl": ("https:" + r["lic"]) if r.get("lic", "").startswith("//") else r.get("lic"),
        "page": r.get("url"),
    }


def pick(recs):
    qrank = {"A": 0, "B": 1, "C": 2}
    korder = {"song": 0, "call": 1, "alarm": 2, "flight": 3, "drum": 4, "sound": 5}
    recs = sorted(recs, key=lambda r: (korder.get(r["kind"], 9), qrank.get(r["quality"], 3), r["duration"] > 45, r["duration"]))
    chosen, per_kind = [], {}
    for r in recs:
        if per_kind.get(r["kind"], 0) >= PER_KIND:
            continue
        chosen.append(r)
        per_kind[r["kind"]] = per_kind.get(r["kind"], 0) + 1
        if len(chosen) >= MAX_PER_SPECIES:
            break
    return chosen


def main():
    key = api_key()
    species = json.loads(PACK.read_text())["species"]
    done = json.loads(OUT.read_text()) if OUT.exists() else {}
    todo = [s for s in species if s["code"] not in done]
    print("species: %d, done: %d, to fetch: %d" % (len(species), len(done), len(todo)), flush=True)
    for n, s in enumerate(todo, 1):
        recs = []
        for q in ('sp:"%s" q_gt:C len:3-120' % s["sci"], 'en:"%s" q_gt:C len:3-120' % s["common"]):
            d = query(q, key)
            time.sleep(DELAY)
            recs = [x for x in (to_recording(r) for r in d.get("recordings", [])) if x]
            if recs:
                break
        done[s["code"]] = pick(recs)
        if n % 100 == 0:
            OUT.write_text(json.dumps(done, ensure_ascii=False))
            print("  %d/%d  (species with recordings so far: %d)" % (n, len(todo), sum(1 for v in done.values() if v)), flush=True)
    OUT.write_text(json.dumps(done, ensure_ascii=False, indent=0))
    print("done. species with recordings: %d of %d; recordings: %d" % (
        sum(1 for v in done.values() if v), len(done), sum(len(v) for v in done.values())), flush=True)


if __name__ == "__main__":
    main()
