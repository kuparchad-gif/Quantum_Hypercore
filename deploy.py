#!/usr/bin/env python3
"""
Deploy nexus-hypercore-001 to Cloudflare Workers.
Usage: python3 deploy.py
"""
import requests
import json
import os
from requests_toolbelt import MultipartEncoder

CF_ACCOUNT = "b99cc553f1a9f631ae76b9c5dd698fbd"
WORKER_NAME = "nexus-hypercore-001"
KV_NAMESPACE_ID = "33be0158fc284aa78eae0511826aacca"

# Token from env (fallback to wrangler cache)
TOKEN = os.environ.get("CF_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN")
if not TOKEN:
    # Try wrangler cache
    try:
        import pathlib
        cache = pathlib.Path.home() / ".wrangler" / "config" / "default.toml"
        if cache.exists():
            for line in cache.read_text().splitlines():
                if "oauth_token" in line or "api_token" in line:
                    TOKEN = line.split("=")[1].strip().strip('"')
                    break
    except Exception:
        pass

if not TOKEN:
    raise SystemExit("ERROR: Set CLOUDFLARE_API_TOKEN in environment before running deploy.py")

H = {"Authorization": f"Bearer {TOKEN}"}
API = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}/workers/scripts/{WORKER_NAME}"

# Read source files
files = {}
for root, dirs, fns in os.walk("src"):
    for fn in fns:
        p = os.path.join(root, fn)
        with open(p, "r") as f:
            files[os.path.relpath(p, "src")] = f.read()

meta = {
    "main_module": "index.js",
    "compatibility_date": "2024-12-18",
    "compatibility_flags": ["nodejs_compat"],
    "bindings": [
        {"type": "plain_text", "name": "WORKER_ID", "text": WORKER_NAME},
        {"type": "plain_text", "name": "DOMAIN", "text": "kuparchad.workers.dev"},
        {"type": "kv_namespace", "name": "KV", "namespace_id": KV_NAMESPACE_ID},
    ],
    "triggers": {
        "crons": ["*/5 * * * *"],
    },
}

ff = {"metadata": (None, json.dumps(meta), "application/json")}
for fp, content in files.items():
    ct = "text/plain" if fp.endswith(".html") else "application/javascript+module"
    ff[fp] = (fp, content, ct)

mp = MultipartEncoder(ff)
print(f"Deploying {WORKER_NAME}...")
r = requests.put(API, headers={**H, "Content-Type": mp.content_type}, data=mp, timeout=30)

if r.status_code in [200, 201]:
    print(f"✓ Deployed {WORKER_NAME}")
    # Enable workers.dev subdomain
    sub_r = requests.post(
        f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}/workers/scripts/{WORKER_NAME}/subdomain",
        headers={**H, "Content-Type": "application/json"},
        json={"enabled": True},
        timeout=10,
    )
    if sub_r.status_code in [200, 201]:
        print(f"✓ Subdomain enabled: https://{WORKER_NAME}.kuparchad.workers.dev")
    else:
        print(f"  Subdomain already enabled or minor issue: {sub_r.status_code}")
else:
    print(f"✗ Deploy failed: {r.status_code}")
    print(r.text[:500])
