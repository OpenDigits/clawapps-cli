#!/usr/bin/env python3
"""
Force N concurrent /cli/v1/ws sessions to bypass cli-relay SessionPool
collapse — used to test R-34 (concurrent_chats entitlement) and R-37
(LRU eviction) at higher tier caps.

Usage:
  multi-session.py <N> <message>           # use ~/.clawapps/credentials.json
  multi-session.py <N> <message> <token>   # explicit token

Output: per-connection summary line
  conn=<idx> sid=<session_id> charged=<bool> cost=<n> reason=<str|None>
"""

import asyncio
import json
import os
import sys
import websockets


def load_token():
    p = os.path.expanduser("~/.clawapps/credentials.json")
    return json.load(open(p))["access_token"]


async def one_session(idx, token, message, base_ws):
    # ?new_session=1 makes cli-relay bypass SessionPool reuse so each
    # ws connection lands on a fresh Bridge entry / session_id.
    url = f"{base_ws}?token={token}&new_session=1"
    sid = None
    charged = None
    cost = None
    reason = None
    try:
        async with websockets.connect(url, open_timeout=30, ping_interval=30) as ws:
            # Wait for cli-relay's type:'connected' before sending action:message
            # — otherwise the message can arrive before cliWs.on('message') is
            # attached (cli-relay registers it AFTER connectBridge resolves)
            # and gets dropped on the floor.
            while True:
                pre = await asyncio.wait_for(ws.recv(), timeout=20)
                try:
                    d0 = json.loads(pre)
                    if d0.get("type") == "connected":
                        sid = d0.get("session_id") or sid
                        break
                except Exception:
                    pass
            await ws.send(json.dumps({"action": "message", "content": message}))
            async for raw in ws:
                try:
                    f = json.loads(raw)
                except Exception:
                    continue
                ev = f.get("type") or f.get("event")
                if ev in ("session_created",):
                    sid = f.get("session_id") or f.get("sessionId")
                if ev == "complete":
                    u = f.get("usage") or {}
                    charged = u.get("charged")
                    cost = u.get("total_cost_credits")
                    reason = u.get("reason")
                    break
                if ev == "error":
                    reason = f.get("code")
                    break
    except Exception as e:
        reason = f"WS_ERROR:{e}"
    return idx, sid, charged, cost, reason


async def main(n, message, token):
    base = "wss://cli-relay.clawapps.cn/cli/v1/ws"
    tasks = [asyncio.create_task(one_session(i + 1, token, f"{message} #{i+1}", base)) for i in range(n)]
    results = await asyncio.gather(*tasks)
    for idx, sid, charged, cost, reason in results:
        sid_disp = sid[:12] if sid else "—"
        print(f"  conn={idx}  sid={sid_disp}  charged={charged}  cost={cost}  reason={reason}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: multi-session.py <N> <message> [token]", file=sys.stderr)
        sys.exit(2)
    n = int(sys.argv[1])
    msg = sys.argv[2]
    tok = sys.argv[3] if len(sys.argv) > 3 else load_token()
    asyncio.run(main(n, msg, tok))
