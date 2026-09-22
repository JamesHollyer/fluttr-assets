#!/usr/bin/env python3
"""Minimal App Store Connect API client (ES256 JWT via openssl) for release chores.

Usage as a module: asc.call("GET", "/v1/apps"). Needs the .p8 key at ~/.private_keys.
"""
import base64, json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
KEY_ID, ISSUER = "WVY2YZ8997", "69a6de84-769e-47e3-e053-5b8c7c11a4d1"
P8 = os.path.expanduser(f"~/.private_keys/AuthKey_{KEY_ID}.p8")
APP, FAMILY_GROUP = "6812117478", "6acb6dd6-25a6-4201-b3d4-dacce5a3aa0f"

def b64(b): return base64.urlsafe_b64encode(b).rstrip(b"=").decode()

def token():
    now = int(time.time())
    header = b64(json.dumps({"alg": "ES256", "kid": KEY_ID, "typ": "JWT"}).encode())
    claims = b64(json.dumps({"iss": ISSUER, "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"}).encode())
    msg = f"{header}.{claims}".encode()
    with tempfile.NamedTemporaryFile(delete=False) as f: f.write(msg); path = f.name
    der = subprocess.check_output(["openssl", "dgst", "-sha256", "-sign", P8, path]); os.unlink(path)
    i = 2; rl = der[i + 1]; r = der[i + 2:i + 2 + rl]; i += 2 + rl; sl = der[i + 1]; s = der[i + 2:i + 2 + sl]
    sig = b64(r[-32:].rjust(32, b"\0") + s[-32:].rjust(32, b"\0"))
    return f"{header}.{claims}.{sig}"

def call(method, path, body=None):
    req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path, method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b"{}")

if __name__ == "__main__":
    st, d = call("GET", f"/v1/builds?filter[app]={APP}&sort=-uploadedDate&limit=5")
    for b in d.get("data", []):
        st2, bd = call("GET", f"/v1/builds/{b['id']}/buildBetaDetail")
        print("build", b["attributes"]["version"], b["attributes"]["processingState"], "external:", bd["data"]["attributes"].get("externalBuildState"), b["id"])
    st, d = call("GET", f"/v1/betaGroups/{FAMILY_GROUP}/betaTesters")
    print("testers:", [(t["attributes"]["email"], t["attributes"].get("state")) for t in d.get("data", [])])
