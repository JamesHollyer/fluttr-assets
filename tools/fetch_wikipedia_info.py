#!/usr/bin/env python3
"""Fetch a short description and a lead image (with attribution) for every
species in the bundled pack, from Wikipedia and Wikimedia Commons.

Uses the batched MediaWiki query API (20 pages / 50 files per request) at a
polite rate, which keeps the whole run to roughly 150 requests.

Reads:  app/assets/data/species-na.json (codes and names)
Writes: tools/data/wiki-info.json  (keyed by eBird code; resumable)

Text is CC BY-SA 4.0 (credit "Wikipedia"). Images carry their own author and
license from Commons; both are stored so the app can credit them.

"""
import json, pathlib, re, socket, sys, time, urllib.error, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "app/assets/data/species-na.json"
OUT = ROOT / "tools/data/wiki-info.json"
UA = "FluttrSpeciesPackBuilder/0.3 (bird watching app data build; j.c.hollyer@gmail.com)"
BATCH_PAGES = 20   # TextExtracts allows at most 20 intro extracts per request
BATCH_FILES = 50
DELAY = 1.2        # seconds between requests
IMG_WIDTH = 640
MAX_DESC = 1200

_last = 0.0

def get_json(url):
    global _last
    for attempt in range(6):
        wait = DELAY - (time.time() - _last)
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                _last = time.time()
                return json.load(r)
        except urllib.error.HTTPError as e:
            _last = time.time()
            if e.code == 429 or e.code >= 500:
                back = 20 * (attempt + 1)
                print("  HTTP %d, backing off %ds" % (e.code, back), flush=True)
                time.sleep(back)
                continue
            raise
        except (urllib.error.URLError, socket.timeout, OSError) as e:
            print("  network error %s, retrying" % e, flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("giving up on " + url)

def api(params):
    params = dict(params, format="json", formatversion=2)
    return get_json("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(params))

def query_pages(titles):
    """Map each requested title to its resolved page (following redirects), skipping missing/disambiguation."""
    d = api({
        "action": "query", "titles": "|".join(titles), "redirects": 1,
        "prop": "extracts|pageimages|pageprops|info",
        "exintro": 1, "explaintext": 1, "exlimit": "max",
        "piprop": "name|original", "pilimit": "max",
        "ppprop": "disambiguation", "inprop": "url",
    })
    q = d.get("query", {})
    alias = {}
    for n in q.get("normalized", []):
        alias[n["from"]] = n["to"]
    for r in q.get("redirects", []):
        alias[r["from"]] = r["to"]
    pages = {p["title"]: p for p in q.get("pages", [])}
    out = {}
    for t in titles:
        final, hops = t, 0
        while final in alias and hops < 5:
            final, hops = alias[final], hops + 1
        p = pages.get(final)
        if p and not p.get("missing") and "disambiguation" not in (p.get("pageprops") or {}) and p.get("extract"):
            out[t] = p
    return out

def clean_extract(text):
    text = re.sub(r"[ \t]*\n[ \t]*", "\n", text).strip()
    if len(text) > MAX_DESC:
        cut = text[:MAX_DESC]
        i = cut.rfind(". ")
        text = cut[: i + 1] if i > 200 else cut.rstrip()
    return text

def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()

def image_infos(file_titles):
    """en.wikipedia's imageinfo also resolves files hosted on Commons, so one host covers both."""
    out = {}
    for i in range(0, len(file_titles), BATCH_FILES):
        batch = file_titles[i : i + BATCH_FILES]
        d = api({"action": "query", "titles": "|".join(batch), "prop": "imageinfo",
                 "iiprop": "url|extmetadata|size", "iiurlwidth": IMG_WIDTH})
        q = d.get("query", {})
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        pages = {p["title"]: p for p in q.get("pages", [])}
        for f in batch:
            p = pages.get(norm.get(f, f))
            info = (p or {}).get("imageinfo")
            if info and info[0].get("thumburl"):
                out[f] = info[0]
        print("  images %d/%d" % (min(i + BATCH_FILES, len(file_titles)), len(file_titles)), flush=True)
    return out

def page_to_rec(p):
    rec = {"description": clean_extract(p["extract"]), "wikiUrl": p.get("fullurl"), "wikiTitle": p.get("title")}
    if p.get("pageimage"):
        rec["_file"] = "File:" + p["pageimage"]
    return rec

def main():
    species = json.loads(PACK.read_text())["species"]
    done = json.loads(OUT.read_text()) if OUT.exists() else {}
    done = {k: v for k, v in done.items() if v}  # retry anything that failed last time
    todo = [s for s in species if s["code"] not in done]
    print("species: %d, already fetched: %d, to fetch: %d" % (len(species), len(done), len(todo)), flush=True)

    # Pass 1: scientific names. Pass 2: common names for whatever is still missing.
    for label, key in (("scientific", "sci"), ("common", "common")):
        pending = [s for s in todo if s["code"] not in done]
        print("pass by %s name: %d species" % (label, len(pending)), flush=True)
        for i in range(0, len(pending), BATCH_PAGES):
            batch = pending[i : i + BATCH_PAGES]
            found = query_pages([s[key] for s in batch])
            for s in batch:
                p = found.get(s[key])
                if p:
                    done[s["code"]] = page_to_rec(p)
            if (i // BATCH_PAGES) % 10 == 9:
                print("  %d/%d" % (min(i + BATCH_PAGES, len(pending)), len(pending)), flush=True)
                OUT.write_text(json.dumps(done, ensure_ascii=False))

    # Images for every record that named a lead image but has no image info yet.
    need = sorted({r["_file"] for r in done.values() if r.get("_file") and not r.get("image")})
    print("fetching info for %d images" % len(need), flush=True)
    infos = image_infos(need)
    for r in done.values():
        f = r.pop("_file", None)
        info = infos.get(f) if f else None
        if info:
            meta = info.get("extmetadata", {}) or {}
            r["image"] = {
                "url": info["thumburl"],
                "width": info.get("thumbwidth"),
                "height": info.get("thumbheight"),
                "artist": (strip_html(meta.get("Artist", {}).get("value"))[:120] or None),
                "license": meta.get("LicenseShortName", {}).get("value"),
                "licenseUrl": meta.get("LicenseUrl", {}).get("value"),
                "page": info.get("descriptionurl"),
            }

    OUT.write_text(json.dumps(done, ensure_ascii=False, indent=0))
    missing = [s["code"] for s in species if s["code"] not in done]
    print("done. descriptions: %d, images: %d, missing: %d" % (
        len(done), sum(1 for r in done.values() if r.get("image")), len(missing)), flush=True)
    if missing:
        print("  missing:", ", ".join(missing[:50]))

if __name__ == "__main__":
    main()
