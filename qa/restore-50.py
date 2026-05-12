#!/usr/bin/env python3
"""
Disaster-recovery loader: restore description / prompt / avatar_url for
the 50 PROD seed roles after a BE data loss (id / display_name / created_at
preserved). Then flip visibility back to `public`.

Sources:
  figures-50.json              — name, desc, prompt (enriched, with the 4
                                  content-moderation-sanitized variants
                                  already substituted)
  figures-50.real-avatars.json — name → wiki avatar URL (45/50 wiki; 5
                                  fallback to DiceBear)

Strategy per role:
  1. GET /cli/v1/roles → resolve role_id by display_name
  2. PUT /cli/v1/roles/{id} with {description, prompt, avatar_url}
  3. PUT /cli/v1/roles/{id}/visibility {"visibility": "public"}

Idempotent: re-running on an already-restored role just re-PUTs the same
values (no harm). Skips figures whose display_name has no role in PROD.
"""

import json, os, sys, time, urllib.parse, urllib.request

BASE = "https://cli-relay.clawapps.cn/cli/v1"
DICEBEAR = "https://api.dicebear.com/9.x/notionists/svg?seed={seed}&backgroundColor=ffd5dc,fdcae1,b6e3f4,c0aede,ffdfbf"


def load_token():
    return json.load(open(os.path.expanduser('~/.clawapps/credentials.json')))['access_token']


def http(method, path, token, body=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(
        f'{BASE}{path}', data=data, method=method,
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode('utf-8'))
        except Exception:
            return e.code, {'_err': 'non-json'}


def main():
    figs = json.load(open('/root/clawapps-cli/qa/figures-50.json'))
    real = {}
    try:
        for entry in json.load(open('/root/clawapps-cli/qa/figures-50.real-avatars.json')):
            if entry.get('wiki'):
                real[entry['name']] = entry['wiki']
    except Exception as e:
        print(f'warn: cannot read real-avatars file ({e}); all fallback DiceBear', file=sys.stderr)

    token = load_token()
    code, body = http('GET', '/roles', token)
    if code != 200:
        print(f'failed to list roles: http={code}', file=sys.stderr)
        sys.exit(2)
    roles = body.get('roles', [])
    rid_by_name = {r['display_name']: r['role_id'] for r in roles}

    ok_put, ok_vis, blocked, fail = 0, 0, 0, 0
    for i, fig in enumerate(figs, 1):
        name = fig['name']
        rid = rid_by_name.get(name)
        if not rid:
            print(f'  [{i:02d}/{len(figs)}] {name:<10}  ⚠ no role_id in PROD — skip')
            fail += 1
            continue
        avatar = real.get(name) or DICEBEAR.format(seed=fig['pinyin'].replace(' ', ''))
        put_body = {
            'description': fig.get('desc', ''),
            'prompt': fig['prompt'],
            'avatar_url': avatar,
        }
        h1, b1 = http('PUT', f'/roles/{rid}', token, put_body)
        if h1 == 200:
            ok_put += 1
            marker = '✓'
        elif h1 == 409 and isinstance(b1, dict) and b1.get('code') == 'CONTENT_MODERATION_BLOCKED':
            data = b1.get('data') or {}
            print(f'  [{i:02d}/{len(figs)}] {name:<10}  ⚠ MOD-BLOCKED labels={data.get("labels")} field={data.get("field")}')
            blocked += 1
            time.sleep(0.3)
            continue
        else:
            print(f'  [{i:02d}/{len(figs)}] {name:<10}  ✗ PUT http={h1} body={str(b1)[:80]}')
            fail += 1
            time.sleep(0.3)
            continue

        h2, b2 = http('PUT', f'/roles/{rid}/visibility', token, {'visibility': 'public'})
        if h2 == 200:
            ok_vis += 1
            print(f'  [{i:02d}/{len(figs)}] {name:<10}  {marker} PUT 200 + visibility=public  rid={rid[:8]}')
        else:
            print(f'  [{i:02d}/{len(figs)}] {name:<10}  ⚠ PUT 200, visibility http={h2} body={str(b2)[:80]}')
        time.sleep(0.3)

    print(f'\n✓ PUT {ok_put}/{len(figs)}   ✓ visibility=public {ok_vis}   ⚠ blocked {blocked}   ✗ {fail}')


if __name__ == '__main__':
    main()
