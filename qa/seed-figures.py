#!/usr/bin/env python3
"""
Seed-data loader: create 50 historical/legendary Chinese figures as PROD
roles for the active user (must be admin tier, cap=50).

Idempotent: skips a figure if a role with the same display_name already
exists. Writes back per-figure {role_id, http_create, http_put} into a
result JSON alongside the input.

Usage:
  cd /root/clawapps-cli/qa
  python3 seed-figures.py figures-50.json [--dry-run]
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request


BASE = "https://cli-relay.clawapps.cn/cli/v1"


def load_token():
    p = os.path.expanduser("~/.clawapps/credentials.json")
    return json.load(open(p))["access_token"]


def req(method, path, body=None, token=None, params=None):
    url = BASE + path
    if params:
        url += ("?" if "?" not in url else "&") + urllib.parse.urlencode(params)
    data = None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8"))
        except Exception:
            body = {"raw": str(e)}
        return e.code, body


def list_existing_names(token):
    code, body = req("GET", "/roles", token=token)
    if code != 200:
        return {}
    out = {}
    for r in body.get("roles", []):
        out[r["display_name"]] = r["role_id"]
    return out


def avatar_url(pinyin):
    seed = pinyin.replace(" ", "")
    return f"https://api.dicebear.com/9.x/notionists/svg?seed={seed}&backgroundColor=ffd5dc,fdcae1,b6e3f4,c0aede,ffdfbf"


def seed(figs, token, dry_run=False):
    existing = list_existing_names(token)
    print(f"Existing roles (by display_name): {len(existing)}", flush=True)
    results = []
    for i, fig in enumerate(figs, 1):
        name = fig["name"]
        if name in existing:
            rid = existing[name]
            print(f"  [{i:02d}/{len(figs)}] {name}  → SKIP (exists, role_id={rid[:8]})", flush=True)
            results.append({"name": name, "role_id": rid, "skipped": True})
            continue

        create_body = {
            "display_name": name,
            "description": fig.get("desc", ""),
            "category": "professional",
            "visibility": "contacts_only",
        }
        if dry_run:
            print(f"  [{i:02d}/{len(figs)}] {name}  → DRY-RUN create", flush=True)
            results.append({"name": name, "dry_run": True})
            continue

        c_code, c_body = req("POST", "/roles", body=create_body, token=token)
        if c_code != 200:
            print(f"  [{i:02d}/{len(figs)}] {name}  ❌ create http={c_code} body={c_body}", flush=True)
            results.append({"name": name, "create_http": c_code, "error": c_body})
            continue
        rid = c_body.get("role_id")

        put_body = {
            "prompt": fig["prompt"],
            "avatar_url": avatar_url(fig["pinyin"]),
        }
        p_code, p_body = req("PUT", f"/roles/{rid}", body=put_body, token=token)
        if p_code != 200:
            print(f"  [{i:02d}/{len(figs)}] {name}  ✓create role_id={rid[:8]}  ❌ put http={p_code}", flush=True)
            results.append({"name": name, "role_id": rid, "create_http": c_code, "put_http": p_code, "put_error": p_body})
            continue

        print(f"  [{i:02d}/{len(figs)}] {name:<10}  ✓ role_id={rid[:8]}  prompt+avatar set", flush=True)
        results.append({"name": name, "role_id": rid, "create_http": c_code, "put_http": p_code})

        # gentle pacing to be friendly to BE
        time.sleep(0.25)
    return results


def main():
    if len(sys.argv) < 2:
        print("usage: seed-figures.py figures-50.json [--dry-run]", file=sys.stderr)
        sys.exit(2)
    figs = json.load(open(sys.argv[1]))
    dry = "--dry-run" in sys.argv[2:]
    token = load_token()
    results = seed(figs, token, dry_run=dry)
    out_path = sys.argv[1].replace(".json", ".results.json")
    json.dump(results, open(out_path, "w"), ensure_ascii=False, indent=2)
    print(f"\nWrote results → {out_path}")
    ok = sum(1 for r in results if r.get("role_id") and not r.get("error") and not r.get("put_error"))
    skipped = sum(1 for r in results if r.get("skipped"))
    print(f"Done. ✓ {ok}/{len(results)}  (skipped existing: {skipped})")


if __name__ == "__main__":
    main()
