#!/usr/bin/env python3
"""
PUT-only prompt updater. Reads enriched prompts from figures-50.json and
overwrites role.prompt on each existing role. No-op for create/avatar.

Idempotent: matches by display_name from existing /cli/v1/roles list.
"""
import json, os, sys, time, urllib.parse, urllib.request

BASE = "https://cli-relay.clawapps.cn/cli/v1"


def load_token():
    return json.load(open(os.path.expanduser("~/.clawapps/credentials.json")))["access_token"]


def put_role(rid, body, token):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/roles/{rid}",
        data=data,
        method="PUT",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {"_err": "non-json"}


def main():
    figs = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "figures-50.json"))
    token = load_token()
    req = urllib.request.Request(f"{BASE}/roles", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=10) as r:
        all_roles = json.loads(r.read().decode("utf-8")).get("roles", [])
    rid_by_name = {x["display_name"]: x["role_id"] for x in all_roles}

    ok, blocked, fail = 0, 0, 0
    for i, fig in enumerate(figs, 1):
        name = fig["name"]
        rid = rid_by_name.get(name)
        if not rid:
            print(f"  [{i:02d}/{len(figs)}] {name:<10}  ⚠ no role_id, skip")
            fail += 1
            continue
        http, body = put_role(rid, {"prompt": fig["prompt"]}, token)
        if http == 200:
            print(f"  [{i:02d}/{len(figs)}] {name:<10}  ✓ {len(fig['prompt'])} chars  rid={rid[:8]}")
            ok += 1
        elif http == 409 and body.get("code") == "CONTENT_MODERATION_BLOCKED":
            data = body.get("data") or {}
            print(f"  [{i:02d}/{len(figs)}] {name:<10}  ⚠ MOD-BLOCKED labels={data.get('labels')} field={data.get('field')}")
            blocked += 1
        else:
            print(f"  [{i:02d}/{len(figs)}] {name:<10}  ✗ http={http} body={str(body)[:120]}")
            fail += 1
        time.sleep(0.4)

    print(f"\n✓ {ok}/{len(figs)}  ⚠ mod-blocked {blocked}  ✗ {fail}")


if __name__ == "__main__":
    main()
