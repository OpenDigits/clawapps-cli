#!/usr/bin/env python3
"""
Replace DiceBear avatars on the 50 seeded figures with real historical
portrait thumbnails from Wikipedia 中文 page-summary API.

Falls back to keeping the existing avatar if Wikipedia has no thumbnail
for that title (mostly mythological / less-illustrated entries).

Usage:
  cd /root/clawapps-cli/qa
  python3 seed-figures-real-avatars.py figures-50.json [--dry-run]
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request


WIKI_API_ZH = "https://zh.wikipedia.org/api/rest_v1/page/summary"
WIKI_API_EN = "https://en.wikipedia.org/api/rest_v1/page/summary"
RELAY_BASE = "https://cli-relay.clawapps.cn/cli/v1"

# Some titles point to a disambiguation or non-historical page on Chinese
# Wikipedia (e.g. 孙子 → 孙子 (军事家) vs disambig). Map figure name → wiki
# article title where the default lookup is wrong.
TITLE_OVERRIDES = {
    "孙子":   "孙武",          # avoid 《孙子》=书 disambig
    "玄奘":   "玄奘",
    "孙悟空": "孙悟空",
    "哪吒":   "哪吒",
    "黄帝":   "黃帝",          # zh-Hant variant Wikipedia uses
    "墨子":   "墨子",
    "汉武帝": "漢武帝",         # zh-Hant
    "唐太宗": "唐太宗",
    "武则天": "武則天",         # zh-Hant
    "包拯":   "包拯",
    "戚继光": "戚繼光",         # zh-Hant
    "李时珍": "李時珍",         # zh-Hant
    "张仲景": "張仲景",         # zh-Hant
    "张良":   "张良",
    "诸葛亮": "諸葛亮",         # zh-Hant
    "项羽":   "項羽",           # zh-Hant
    "蔡文姬": "蔡文姬",
    "范蠡":   "范蠡",
    "刘备":   "劉備",           # zh-Hant
    "关羽":   "關羽",           # zh-Hant
    "张飞":   "張飛",           # zh-Hant
    "曹操":   "曹操",
    "苏轼":   "蘇軾",           # zh-Hant
    "陆游":   "陸游",           # zh-Hant
    "辛弃疾": "辛棄疾",         # zh-Hant
    "李清照": "李清照",
    "文天祥": "文天祥",
    "岳飞":   "岳飛",           # zh-Hant
    "西施":   "西施",
    "商鞅":   "商鞅",
    "汉武帝": "漢武帝",
    "韩非子": "韩非",
    "鲁班":   "鲁班",
    "关汉卿": "关汉卿",
    "朱熹":   "朱熹",
    "司马迁": "司马迁",
    "王安石": "王安石",
    "唐太宗": "唐太宗",
    "杜甫":   "杜甫",
    "屈原":   "屈原",
    "庄子":   "莊子 (書)",  # 庄子 disambig defaults to person — keep simple
    "庄子":   "莊子",
}


def http_json(url, ua="ClawApps-Seed/1.0"):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, None
    except Exception as e:
        return 0, {"_err": str(e)}


# Pinyin fallback for English Wikipedia lookups (a few cases need en page)
EN_TITLES = {
    "曹操": "Cao Cao", "刘备": "Liu Bei", "关羽": "Guan Yu", "张飞": "Zhang Fei",
    "诸葛亮": "Zhuge Liang", "杜甫": "Du Fu", "武则天": "Wu Zetian",
    "唐太宗": "Emperor Taizong of Tang", "包拯": "Bao Zheng", "王安石": "Wang Anshi",
    "李清照": "Li Qingzhao", "岳飞": "Yue Fei", "辛弃疾": "Xin Qiji",
    "陆游": "Lu You", "文天祥": "Wen Tianxiang", "朱熹": "Zhu Xi",
    "关汉卿": "Guan Hanqing", "朱元璋": "Hongwu Emperor", "王阳明": "Wang Yangming",
    "戚继光": "Qi Jiguang", "李时珍": "Li Shizhen", "康熙": "Kangxi Emperor",
    "鲁班": "Lu Ban", "哪吒": "Nezha",
    "孙子": "Sun Tzu", "商鞅": "Shang Yang", "秦始皇": "Qin Shi Huang",
    "项羽": "Xiang Yu", "刘邦": "Emperor Gaozu of Han", "韩信": "Han Xin",
    "张良": "Zhang Liang (Western Han)", "司马迁": "Sima Qian",
    "汉武帝": "Emperor Wu of Han", "张仲景": "Zhang Zhongjing", "班超": "Ban Chao",
    "华佗": "Hua Tuo", "玄奘": "Xuanzang",
}


def _fetch(api_base, title, max_retry=2):
    encoded = urllib.parse.quote(title)
    url = f"{api_base}/{encoded}"
    for attempt in range(max_retry + 1):
        code, body = http_json(url)
        if code == 200 and isinstance(body, dict):
            return body
        if code == 429:
            time.sleep(6 * (attempt + 1))
            continue
        return None
    return None


def wiki_thumb(title, name):
    body = _fetch(WIKI_API_ZH, title)
    if body:
        thumb = body.get("thumbnail") or body.get("originalimage")
        if thumb and thumb.get("source"):
            return thumb["source"]
    # zh failed → try simplified name if title was traditional
    if title != name:
        body = _fetch(WIKI_API_ZH, name)
        if body:
            thumb = body.get("thumbnail") or body.get("originalimage")
            if thumb and thumb.get("source"):
                return thumb["source"]
    # zh both ways failed → try English
    en_title = EN_TITLES.get(name)
    if en_title:
        body = _fetch(WIKI_API_EN, en_title)
        if body:
            thumb = body.get("thumbnail") or body.get("originalimage")
            if thumb and thumb.get("source"):
                return thumb["source"]
    return None


def load_token():
    return json.load(open(os.path.expanduser("~/.clawapps/credentials.json")))["access_token"]


def relay_put(rid, body, token):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{RELAY_BASE}/roles/{rid}",
        data=data,
        method="PUT",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def main():
    if len(sys.argv) < 2:
        print("usage: seed-figures-real-avatars.py figures-50.json [--dry-run]", file=sys.stderr)
        sys.exit(2)
    figs = json.load(open(sys.argv[1]))
    results_path = sys.argv[1].replace(".json", ".results.json")
    if not os.path.exists(results_path):
        print(f"missing {results_path} — run seed-figures.py first", file=sys.stderr)
        sys.exit(2)
    results = json.load(open(results_path))
    rid_by_name = {r["name"]: r.get("role_id") for r in results if r.get("role_id")}

    # Some figures were created in retry, not present in results.json — pull
    # current roles list to fill the gap.
    token = load_token()
    code, body = http_json(f"{RELAY_BASE}/roles", ua="ClawApps-Seed/1.0")
    # roles endpoint requires auth; do raw with header instead
    req = urllib.request.Request(f"{RELAY_BASE}/roles", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=10) as r:
        all_roles = json.loads(r.read().decode("utf-8")).get("roles", [])
    name_to_rid = {x["display_name"]: x["role_id"] for x in all_roles}

    dry = "--dry-run" in sys.argv[2:]
    real, fallback, missing = 0, 0, 0
    new_results = []
    for fig in figs:
        name = fig["name"]
        rid = rid_by_name.get(name) or name_to_rid.get(name)
        if not rid:
            print(f"  {name:<10}  ⚠ no role_id (skip)")
            missing += 1
            new_results.append({"name": name, "skipped": "no role_id"})
            continue

        title = TITLE_OVERRIDES.get(name, name)
        thumb = wiki_thumb(title, name)
        if not thumb:
            print(f"  {name:<10}  ◦ no wiki thumb (keep dicebear)")
            fallback += 1
            new_results.append({"name": name, "role_id": rid, "wiki": None})
            time.sleep(1.5)
            continue

        if dry:
            print(f"  {name:<10}  ✓ wiki={thumb[:80]}")
            real += 1
            time.sleep(1.5)
            continue

        http = relay_put(rid, {"avatar_url": thumb}, token)
        if http == 200:
            print(f"  {name:<10}  ✓ wiki put ok  {thumb[:80]}")
            real += 1
        else:
            print(f"  {name:<10}  ✗ wiki PUT http={http} url={thumb[:80]}")
            fallback += 1
        new_results.append({"name": name, "role_id": rid, "wiki": thumb, "put_http": http})
        time.sleep(1.5)

    out_path = sys.argv[1].replace(".json", ".real-avatars.json")
    json.dump(new_results, open(out_path, "w"), ensure_ascii=False, indent=2)
    print(f"\n✓ {real} real wiki portraits · {fallback} kept dicebear · {missing} missing role_id")
    print(f"Wrote → {out_path}")


if __name__ == "__main__":
    main()
