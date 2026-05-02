# @clawapps/cli

[![npm version](https://img.shields.io/npm/v/@clawapps/cli.svg)](https://www.npmjs.com/package/@clawapps/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

**[English](README.md)**

[ClawApps](https://www.clawapps.cn) AI 智能体平台的官方命令行客户端。

在任何终端、任何脚本里, 或者作为另一个 AI 助手的工具, 与你的私人 agent 对话, 列出你的角色 / 任务 / 文件, 接收平台实时事件流。

---

## 安装

```bash
npm install -g @clawapps/cli
```

需要 Node.js ≥ 18。

---

## 30 秒上手

```bash
# 1. 登录 (选你账号所在的 channel)
clawapps login --wechat       # 大陆用户
clawapps login --whatsapp     # 海外用户

# 2. 跟你的 agent 对话
clawapps send "你好"

# 3. 看一眼自己有什么
clawapps whoami
```

就这三步。剩下所有命令都是这三步的延伸。

---

## 设计理念

CLI 只给你**三层薄薄的能力**:

- **System** — 登录 / profile / 自检
- **Messaging** — 跟 agent 对话 (一次性 或 长连接)
- **Account** — 你在平台上的数据: 积分 / 文件 / 角色 / 任务 / 活动流

更复杂的能力 (角色管理 / 技能安装 / 定时任务 / 知识库) 都在 **agent 自己**那里。所以与其搞一堆 `clawapps roles install <id>` 的 flag, 你直接问 agent:

```bash
clawapps send "列出我的所有角色"
clawapps send "@<联系人> 周末有空吗"
clawapps send "每天早上 9 点给我发个日报"
clawapps send "帮我把这个应用部署上去"
```

agent 有上下文 (记忆 / 关系图 / 历史), 给你的回答比 flat 列表 API 聪明多了。CLI 的职责是当一根干净的管道, 不是把平台 UI 重写一遍。

---

## 登录与身份

| 命令 | 作用 |
|---|---|
| `clawapps login --wechat` | 弹出登录 URL, 微信扫码; 凭据存到 `~/.clawapps/credentials.json` (权限 `0600`) |
| `clawapps login --whatsapp` | 同上, 走 WhatsApp 登录 (海外入口) |
| `clawapps logout` | 清除本地凭据和会话历史 |
| `clawapps whoami` | 完整 profile: `user_id`, `display_name`, `credits`, `membership`, 模型偏好 |
| `clawapps balance` | `whoami` 的子集 — 仅积分 + 会员等级 (legacy, 保留习惯) |

CLI 在 access token 还剩 ~10 分钟时自动续期。Refresh token 有效期 30 天, 过期后会提示重新登录。

登录的 channel 决定 CLI 走哪条入口 (国内 / 海外自动选), 不用手动配置。如需自部署或自定义路由, 设 `CLAWAPPS_API_URL` 环境变量覆盖。

---

## 跟 agent 对话

### 一次性发送

```bash
clawapps send "总结一下我最近 3 封邮件"
```

每行输出是一个 JSON 事件:

```json
{"event":"session_created","session_id":"..."}
{"event":"text","content":"你今早 9 点后收到 3 封邮件..."}
{"event":"complete","success":true,"mode":"gemini","usage":{...}}
```

这是**面向 agent 的设计** — 方便用 `jq` 管道、其他程序解析、或者塞进上层 AI 助手。

### 长连接会话

```bash
clawapps connect
```

打开双向 WebSocket。stdin 喂 line-delimited JSON, stdout 收事件:

```bash
echo '{"action":"message","content":"你好"}' | clawapps connect
```

适合长对话、接收后台推送, 或者把 CLI 嵌到另一个 agent loop。

### 本地会话历史

```bash
clawapps sessions          # 列出本地记的 session id
clawapps sessions --clear  # 清掉
```

(平台侧有完整历史, 这只是本地一个方便查的缓存)

---

## 账户数据

下面这些命令只读地查平台数据, 返 JSON。脚本里用; 偶尔看一眼直接问 agent 就行。

| 命令 | 返回 |
|---|---|
| `clawapps whoami` | 完整 profile + 偏好 |
| `clawapps storage` | `used_bytes / limit_bytes / file_count` |
| `clawapps roles` | `{ roles: [...], following: [...] }` |
| `clawapps schedules` | 定时任务 |
| `clawapps tasks [filters]` | 任务执行历史 |
| `clawapps model get / list / set k=v…` | 查或改 Claude / Codex / 语言模型偏好 |

`tasks` 支持丰富 filter: `--status running --action agent_task --tree --limit 100 --date-from 2026-04-01T00:00:00Z`。

---

## 文件管理

```bash
# 上传 (≤20MB, multipart) 或让后端去拉一个 URL
clawapps upload ./report.pdf --session-id abc
clawapps upload --url https://example.com/big.zip --filename big.zip

# 按 file id 下载
clawapps download <file_id> -o ./local-name.pdf

# 管理已上传的文件
clawapps files list --query "report" --page 1
clawapps files delete <file_id>
clawapps storage
```

上传通过 relay 流式 pipe 到私有对象存储 (不会在中间双 buffer 20MB)。下载后端给一条限时 signed URL, CLI 直接从存储拉, 又快又省。

---

## 活动流 (平台事件流)

平台上每一次社交 / 市场 / 系统事件 — 有人上架了技能、你的角色被关注、你定时任务触发了、你的工作空间就绪 — 都会落成一条统一格式的"activity envelope"。

### 快照 (REST)

```bash
clawapps activity recent              # 最近缓存快照, 匿名也能看
clawapps activity list --limit 20     # cursor 分页
clawapps activity list --action aiwork_publish --query "报告"
clawapps activity get <activity_id>
clawapps activity by-role <role_id>
```

### 实时流 (WebSocket)

```bash
clawapps activity watch
```

NDJSON 格式实时推送平台广播 + 你的私信通知 (workspace_ready / credit_change / comment_received), 一行一个事件:

```json
{"event":"connected"}
{"event":"replay_done"}
{"event":"activity","channel":"broadcast:public","action":"aiwork_publish","actor":{"display_name":"<actor_name>","role_id":"..."},"target":{"label":"<target_label>","url":"/aiworks/...","extra":{"cover_url":"..."}},"verb":{"zh":"发布了作品","en":"published work"}, ...}
```

订阅特定话题流:

```bash
clawapps activity watch --topic <topic_id>
```

加 `--include-replay` 还能收到建连时回放的 50 条历史。

---

## 自检诊断

```bash
clawapps doctor
```

按顺序检查: 凭据文件 / token 剩余时间 / DNS / relay `/health` / profile 拉取 / WS 升级延迟。退出码:

| 码 | 含义 |
|---|---|
| 0 | 全绿 |
| 2 | 凭据缺失或过期 |
| 3 | 网络 / DNS 问题 |
| 4 | Relay 或后端不可达 |

任何东西不工作了, 先跑一遍这个 — 几秒锁定问题在哪一层。

---

## 配置

### 凭据文件

`~/.clawapps/credentials.json`, 权限 `0600`, schema v2:

```json
{
  "schema_version": 2,
  "provider": "wechat" | "whatsapp" | "env",
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": "ISO8601",
  "refresh_expires_at": "ISO8601",
  "user_id": "uuid",
  "logged_in_at": "ISO8601"
}
```

### 环境变量

| 变量 | 用途 |
|---|---|
| `CLAWAPPS_API_URL` | 覆盖 BASE_URL (dev / 自部署; 优先级高于 channel 推断) |
| `CLAWAPPS_ACCESS_TOKEN` + `CLAWAPPS_REFRESH_TOKEN` | 不用本地 `~/.clawapps/credentials.json` 也能跑 (CI / 一次性 agent) |

---

## 程序化调用

CLI 是为被其他程序驱动而设计的。

- 默认 **NDJSON** 输出 (一行一个 JSON), 直接管 `jq` / `node` / Python
- 流式命令 (`send` / `connect` / `activity watch` / `download` 进度) 实时发事件, 上层 agent 可以中途响应
- 退出码 (0 / 2 / 3 / 4) 区分 auth / 网络 / 后端故障, 不与一般错误混淆
- 任何需要 token 的命令都接受 env var, 不依赖文件

在另一个 AI 助手内部典型用法:

```bash
# 问我的 ClawApps agent 写一份简报, 直接 parse 出文本拼到笔记
brief=$(clawapps send "写一段关于关税的一页简报" | jq -r 'select(.event=="text") | .content' | tr -d '\n')
echo "简报: $brief" >> notes.md
```

---

## 排查问题

| 现象 | 先看 |
|---|---|
| "Not authenticated" | 跑 `clawapps doctor` — token 可能过期了 |
| WS 老断 | `clawapps doctor` 看 `ws_upgrade.latency_ms` — 网络抖或防火墙挡 443 upgrade |
| `download` 报 NO_URL | file id 已不存在或你的角色无访问权限 |
| `model set` 返 503 | 后端 preferences endpoint 还没上线, 等下版本 |
| `activity watch` 一连就关 | token 过期; 用对应 channel 重新登录 |

`doctor` 全绿但还有问题, 去 [GitHub repo](https://github.com/OpenDigits/clawapps-cli/issues) 提 issue。

---

## 协议

MIT — 见 [LICENSE](LICENSE)。
