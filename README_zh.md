# @clawapps/cli

[![npm version](https://img.shields.io/npm/v/@clawapps/cli.svg)](https://www.npmjs.com/package/@clawapps/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

**[English](README.md)**

[ClawApps](https://www.clawapps.ai) AI Agent 平台的命令行客户端。通过微信或 WhatsApp 登录，向 Agent 工作空间发送消息，并集成到 AI 助手与脚本中。

## 安装

```bash
npm install -g @clawapps/cli
```

## 快速上手

```bash
# 1. 登录(选择一个 channel)
clawapps login --wechat
clawapps login --whatsapp

# 2. 查询余额
clawapps balance

# 3. 单次发送
clawapps send "你好"

# 4. 或维持持久会话
clawapps connect
```

## 设计哲学

CLI 只暴露**三层瘦命令**:
- **系统层** — 登录、自检、本地配置
- **消息层** — 跟你的 Agent 说话
- **账号层** — 积分、档案、用量

其余所有功能(角色、任务、作品、知识库、记忆)都活在 **Agent 内部**。直接用自然语言问就行:

```bash
clawapps send "列出我的所有角色"
clawapps send "我现在有什么任务在跑?"
clawapps send "@张老师 周末有空吗"
clawapps send "我有哪些已上线的作品"
clawapps send "搜知识库:关于 K8s 的笔记"
```

我们故意不做 `roles` / `tasks` / `apps` / `kb` 这些子命令 —— Agent 拥有完整上下文(记忆、关系、历史),回答比 API 列表更智能。

## 命令

### `clawapps login --wechat | --whatsapp`

从指定 channel 登录平台。CLI 输出登录链接,在浏览器中打开完成扫码 / 配对,CLI 自动检测成功并把凭证落到 `~/.clawapps/credentials.json`(权限 `0600`)。

```text
$ clawapps login --wechat

ClawApps Login — WeChat

Step 1. Open this link in your browser:

    https://clawapps.cn/wechat-login?cli_code=ABC123

Step 2. Authenticate via WeChat.

Waiting for you to scan… (link valid for 180 seconds)
   150 seconds remaining

✓ Login successful!

  Welcome, Jay 👋
  Channel:     WeChat
  Credits:     5060.27
  Membership:  pro

🦞 已接入应用龙虾 ClawApps 平台，可以开始聊天找服务。
```

登录链接 3 分钟内有效。超时未扫码会以 `1` 退出。

### `clawapps logout`

清除本地凭证和会话历史。

### `clawapps balance`

返回用户积分。

```bash
$ clawapps balance
{"credits":5060.27,"membership":"pro","display_name":"Jay"}
```

### `clawapps send <message>`

发送一条消息到 Agent 工作空间,事件以 JSON 行的形式流式打印到 stdout(每行一个对象)。适合脚本和 AI Agent 集成。

```bash
$ clawapps send "Toronto 今天天气如何?"
{"event":"session_created","session_id":"abc-123"}
{"event":"text","content":"Toronto 今天 7°C,有雨。"}
{"event":"cost","credits_used":0.42,"balance_after":5059.85}
{"event":"complete","success":true,"mode":"chat"}
```

参数: `--session-id <id>` `--new-session` `--timeout <ms>`

### `clawapps connect`

维持一个持久 WebSocket 会话。从 stdin 读 JSON 命令,事件流写到 stdout。

stdin(每行一个 JSON 命令):

```json
{"action":"message","content":"你好"}
{"action":"stop"}
```

stdout: 与 `send` 相同的事件流。

参数: `--session-id <id>` `--timeout <ms>`

### `clawapps sessions`

列出或清空本地会话历史。

```bash
$ clawapps sessions
$ clawapps sessions --clear
```

## v0.9 即将发布 (Preview)

下列命令是 v0.9 路线图。下面这些 JSON 契约已经定稿,你可以现在就把 agent 接上。

### `clawapps whoami`

显示当前登录身份。

```bash
$ clawapps whoami
{"user_id":"uuid","display_name":"Jay","membership":"pro","channel":"wechat","expires_at":"2026-04-29T21:21:00.000Z"}
```

### `clawapps doctor`

跑一遍自检。Agent 测试管道时用来排错。

```bash
$ clawapps doctor
{"check":"credentials","ok":true}
{"check":"network","ok":true,"latency_ms":42}
{"check":"relay_reachable","ok":true}
{"check":"workspace_ready","ok":true}
{"summary":"all checks passed"}
```

### `clawapps stop`

中断 Agent 当前正在生成的回复 (向当前会话发 `{action:"stop"}`)。

```bash
$ clawapps stop
{"event":"stopped"}
```

### `clawapps profile [--update <key=value>]`

读取或更新账号档案。

```bash
$ clawapps profile
{"display_name":"Jay","preferred_language":"zh","preferences":{"theme":"dark"}}

$ clawapps profile --update display_name=Jacky
{"event":"updated","display_name":"Jacky"}
```

### `clawapps usage [--period 7d] [--by mode]`

查看积分用量统计。

```bash
$ clawapps usage --period 7d
{"period":"7d","total_credits":42.5,"by_day":[{"date":"2026-04-22","credits":7.1}, ...]}

$ clawapps usage --period 30d --by mode
{"period":"30d","by_mode":{"chat":120.4,"task":35.7,"role":18.2}}
```

### `clawapps config <get|set> <key> [value]`

持久化本地配置在 `~/.clawapps/config.json`。

```bash
$ clawapps config set base_url https://staging-api.clawapps.ai
$ clawapps config get base_url
{"key":"base_url","value":"https://staging-api.clawapps.ai"}
```

## 后续规划

- `clawapps subscribe` — 管理订阅(返回支付链接,CLI 永不接信用卡)
- `clawapps add-credit <amount>` — 充值(返回支付链接)

## 事件流参考

`send` / `connect` 在 stdout 输出的 JSON 事件:

| Event             | 关键字段                                  | 说明                                |
|-------------------|-------------------------------------------|-------------------------------------|
| `session_created` | `session_id`                              | Relay 分配的 session ID             |
| `ready`           | —                                         | (仅 `connect`) 准备好接收输入       |
| `text`            | `content`                                 | 流式纯文本回复                      |
| `formatted`       | `mode`, `intro`, `ui_tree`, `timing`      | 结构化 UI tree 输出                 |
| `status` / `log`  | `state`, `level`, `message`               | 中间过程信号                        |
| `mode_change`     | `mode`, `reason`                          | 工作空间切换 chat / task / role     |
| `cost`            | `credits_used`, `balance_after`           | 单轮扣费                            |
| `complete`        | `success`, `mode`, `usage`                | 单轮结束                            |
| `error`           | `code`, `message`                         | CLI 或后端错误                      |

## 凭证

存储在 `~/.clawapps/credentials.json`,权限 `0600`:

```json
{
  "provider": "whatsapp",
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_at": "2026-04-26T21:21:00.000Z",
  "refresh_expires_at": "2026-05-25T21:21:00.000Z",
  "user_id": "uuid",
  "logged_in_at": "2026-04-25T21:21:00.000Z"
}
```

**自动刷新**: 任何命令在用 token 前会先检查 `expires_at`,剩余 < 10 分钟时透明调用 `/cli/v1/auth/refresh`,access + refresh 一起轮换。如果 refresh token 也过期,凭证被清空,引导用户重新登录。

**环境变量覆盖**: 同时设置 `CLAWAPPS_ACCESS_TOKEN` + `CLAWAPPS_REFRESH_TOKEN` 时,CLI 跳过本地文件直接使用环境变量值。

## 配置

| 环境变量                  | 默认值                           | 说明                                       |
|---------------------------|----------------------------------|--------------------------------------------|
| `CLAWAPPS_API_URL`        | `https://api.clawapps.ai`        | 平台 base URL(HTTP + WS 共用)             |
| `CLAWAPPS_ACCESS_TOKEN`   | —                                | 用环境变量覆盖凭证文件(配合 refresh)      |
| `CLAWAPPS_REFRESH_TOKEN`  | —                                | 用环境变量覆盖凭证文件(配合 access)       |

所有端点都在同一个 base 下的 `/cli/v1/*`,没有独立 relay URL。

## 退出码

| Code | 含义                                    |
|------|-----------------------------------------|
| 0    | 成功                                    |
| 1    | 用户参数错(参数缺失/格式错)              |
| 2    | 鉴权失败或失效                          |
| 3    | 网络或上游错                            |
| 4    | 余额不足 / 配额耗尽                     |
| 5    | 资源不存在                              |

## AI Agent 集成

CLI 设计为可被 AI Agent(Claude / Codex 等)作为子进程调用:

```bash
clawapps send "帮我部署 app" | jq -c '.'
```

每个事件是独立一行 JSON,无多行缓冲,无转义续行。需要长会话时用 `clawapps connect`,从 stdin 写 `{"action":"message",...}` 命令。

也可以通过环境变量绕过登录流程:

```bash
export CLAWAPPS_ACCESS_TOKEN="eyJ..."
export CLAWAPPS_REFRESH_TOKEN="eyJ..."
clawapps send "你好"
```

## 开发

```bash
git clone git@github.com:OpenDigits/clawapps-cli.git
cd clawapps-cli
npm install
npm run build
node bin/claw.js login --wechat
```

## 环境要求

- **Node.js >= 18**(使用原生 `fetch`)

## 许可证

[MIT](LICENSE) — Copyright 2026 ClawApps
