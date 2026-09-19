#!/usr/bin/env python3
"""Upload a file as a GitHub release asset on the public assets repo.

    python3 publish_asset.py <tag> <file> [--name NAME] [--notes TEXT]

Creates the release if the tag does not exist. Needs GITHUB_TOKEN in tools/.env (a
fine-grained token with Contents: read/write on JamesHollyer/fluttr-assets). Prints the
public download URL, which is what the app embeds.
"""
import argparse, json, os, pathlib, sys, urllib.request, urllib.error

REPO = "JamesHollyer/fluttr-assets"
API = "https://api.github.com"

def env_token() -> str:
    for line in (pathlib.Path(__file__).parent / ".env").read_text().splitlines():
        if line.startswith("GITHUB_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit("GITHUB_TOKEN missing from tools/.env")

def call(token: str, method: str, url: str, body=None, data=None, content_type="application/json"):
    req = urllib.request.Request(url, method=method, data=data if data is not None else (json.dumps(body).encode() if body else None),
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "Content-Type": content_type, "User-Agent": "fluttr-publish"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tag"); ap.add_argument("file"); ap.add_argument("--name"); ap.add_argument("--notes", default="")
    a = ap.parse_args()
    token = env_token()
    path = pathlib.Path(a.file); name = a.name or path.name
    st, rel = call(token, "GET", f"{API}/repos/{REPO}/releases/tags/{a.tag}")
    if st == 404:
        st, rel = call(token, "POST", f"{API}/repos/{REPO}/releases", {"tag_name": a.tag, "name": a.tag, "body": a.notes, "draft": False, "prerelease": False})
        if st != 201: sys.exit(f"create release failed: {st} {rel}")
        print("created release", a.tag)
    elif st != 200:
        sys.exit(f"lookup failed: {st} {rel}")
    for asset in rel.get("assets", []):
        if asset["name"] == name:
            call(token, "DELETE", f"{API}/repos/{REPO}/releases/assets/{asset['id']}")
            print("replaced existing asset", name)
    upload = rel["upload_url"].split("{")[0] + f"?name={urllib.parse.quote(name)}"
    st, res = call(token, "POST", upload, data=path.read_bytes(), content_type="application/octet-stream")
    if st != 201: sys.exit(f"upload failed: {st} {res}")
    print(f"{res['size']} bytes ->", res["browser_download_url"])

if __name__ == "__main__":
    import urllib.parse
    main()
