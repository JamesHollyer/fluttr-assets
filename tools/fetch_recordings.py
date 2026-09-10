#!/usr/bin/env python3
"""Find playable recordings (songs and calls) for every species on Wikimedia Commons.

Commons mirrors thousands of Xeno-canto recordings under Creative Commons licenses
and serves an MP3 rendition of every OGG, which matters because iOS cannot play OGG.

Reads:  app/assets/data/species-na.json
Writes: tools/data/recordings.json  {code: [recording, ...]}  (resumable)

Each recording: id, title, kind (song/call/alarm/flight/drum/sound), url (mp3),
duration (s), recordist, license, licenseUrl, page.
"""
import json, pathlib, re, threading, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "app/assets/data/species-na.json"
OUT = ROOT / "tools/data/recordings.json"
UA = "FluttrSpeciesPackBuilder/0.3 (bird watching app data build; j.c.hollyer@gmail.com)"
DELAY = 0.3          # shared across workers: ~200 requests/minute, Wikimedia's limit
WORKERS = 4
_lock = threading.Lock()
SEARCH_LIMIT = 25
MAX_PER_SPECIES = 6
MAX_SECONDS = 300
MIN_SECONDS = 2
_last = 0.0


def api(params):
    global _last
    with _lock:
        wait = DELAY - (time.time() - _last)
        if wait > 0:
            time.sleep(wait)
        _last = time.time()
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(dict(params, format="json", formatversion=2))
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(20 * (attempt + 1)); continue
            raise
        except Exception:
            time.sleep(3 * (attempt + 1))
    return {}


def strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def classify(text):
    t = text.lower()
    if "song" in t or "singing" in t or "dawn" in t:
        return "song"
    if "alarm" in t or "scold" in t:
        return "alarm"
    if "flight call" in t or "flight-call" in t:
        return "flight"
    if "drum" in t:
        return "drum"
    if "call" in t or "chip" in t or "note" in t or "begging" in t:
        return "call"
    return "sound"


def search(term):
    d = api({"action": "query", "list": "search", "srnamespace": 6, "srlimit": SEARCH_LIMIT,
             "srsearch": 'filetype:audio "%s"' % term})
    return [h["title"] for h in d.get("query", {}).get("search", [])]


def infos(titles):
    out = {}
    for i in range(0, len(titles), 50):
        batch = titles[i:i + 50]
        d = api({"action": "query", "titles": "|".join(batch), "prop": "videoinfo",
                 "viprop": "url|size|mime|derivatives|extmetadata"})
        for p in d.get("query", {}).get("pages", []):
            vi = (p.get("videoinfo") or [None])[0]
            if vi:
                out[p["title"]] = (p.get("pageid"), vi)
    return out


def to_recording(title, pageid, vi):
    mime = vi.get("mime", "")
    duration = vi.get("duration")
    if not duration or duration < MIN_SECONDS or duration > MAX_SECONDS:
        return None
    url = None
    if mime == "audio/mpeg":
        url = vi.get("url", "").split("?")[0]
    else:
        for d in vi.get("derivatives", []) or []:
            if d.get("transcodekey") == "mp3" or d.get("type", "").startswith("audio/mpeg"):
                url = d.get("src", "").split("?")[0]
                break
    if not url:
        return None
    meta = vi.get("extmetadata", {}) or {}
    desc = strip_html(meta.get("ImageDescription", {}).get("value"))
    return {
        "id": str(pageid),
        "title": title[5:],
        "kind": classify(title + " " + desc),
        "url": url,
        "duration": round(float(duration), 1),
        "recordist": (strip_html(meta.get("Artist", {}).get("value"))[:80] or None),
        "license": meta.get("LicenseShortName", {}).get("value"),
        "licenseUrl": meta.get("LicenseUrl", {}).get("value"),
        "page": vi.get("descriptionurl"),
    }


def pick(recs):
    """Up to MAX_PER_SPECIES, mixing songs and calls, shorter first within a kind."""
    order = {"song": 0, "call": 1, "alarm": 2, "flight": 3, "drum": 4, "sound": 5}
    recs = sorted(recs, key=lambda r: (order.get(r["kind"], 9), r["duration"] > 60, r["duration"]))
    chosen, per_kind = [], {}
    for r in recs:
        if per_kind.get(r["kind"], 0) >= 3:
            continue
        chosen.append(r)
        per_kind[r["kind"]] = per_kind.get(r["kind"], 0) + 1
        if len(chosen) >= MAX_PER_SPECIES:
            break
    return chosen


def mentions(text, s):
    """Loose searches return neighbours; keep only files that name this species."""
    t = re.sub(r"[^a-z ]", " ", text.lower())
    sci = s["sci"].lower()
    common = re.sub(r"[^a-z ]", " ", s["common"].lower())
    return sci in t or common in t


def second_pass(species, done):
    """For species still empty: unquoted scientific-name search, filtered by name mention."""
    todo = [s for s in species if not done.get(s["code"]) and s.get("freq", {}).get("usca", 0) >= 200]
    print("second pass over %d US/CA species without recordings" % len(todo), flush=True)

    def work(s):
        d = api({"action": "query", "list": "search", "srnamespace": 6, "srlimit": SEARCH_LIMIT,
                 "srsearch": "filetype:audio %s" % s["sci"]})
        titles = [h["title"] for h in d.get("query", {}).get("search", [])]
        recs = []
        if titles:
            for title, (pageid, vi) in infos(titles).items():
                meta = vi.get("extmetadata", {}) or {}
                desc = strip_html(meta.get("ImageDescription", {}).get("value"))
                if not mentions(title + " " + desc, s):
                    continue
                r = to_recording(title, pageid, vi)
                if r:
                    recs.append(r)
        return s["code"], pick(recs)

    found = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for fut in as_completed([ex.submit(work, s) for s in todo]):
            code, recs = fut.result()
            if recs:
                done[code] = recs
                found += 1
    OUT.write_text(json.dumps(done, ensure_ascii=False, indent=0))
    print("second pass found recordings for %d more species" % found, flush=True)


def main():
    import sys
    species = json.loads(PACK.read_text())["species"]
    if "--retry-missing" in sys.argv:
        done = json.loads(OUT.read_text()) if OUT.exists() else {}
        second_pass(species, done)
        return
    done = json.loads(OUT.read_text()) if OUT.exists() else {}
    todo = [s for s in species if s["code"] not in done]
    print("species: %d, done: %d, to fetch: %d" % (len(species), len(done), len(todo)), flush=True)
    def work(s):
        titles = search(s["sci"]) or search(s["common"])
        recs = []
        if titles:
            for title, (pageid, vi) in infos(titles).items():
                r = to_recording(title, pageid, vi)
                if r:
                    recs.append(r)
        return s["code"], pick(recs)

    n = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for fut in as_completed([ex.submit(work, s) for s in todo]):
            code, recs = fut.result()
            done[code] = recs
            n += 1
            if n % 100 == 0:
                OUT.write_text(json.dumps(done, ensure_ascii=False))
                have = sum(1 for v in done.values() if v)
                print("  %d/%d  (species with recordings so far: %d)" % (n, len(todo), have), flush=True)
    OUT.write_text(json.dumps(done, ensure_ascii=False, indent=0))
    have = sum(1 for v in done.values() if v)
    total = sum(len(v) for v in done.values())
    print("done. species with recordings: %d of %d; recordings: %d" % (have, len(done), total), flush=True)


if __name__ == "__main__":
    main()
