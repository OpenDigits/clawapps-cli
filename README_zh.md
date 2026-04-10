# @clawapps/cli

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

**[English](README.md)**

[ClawApps](https://www.clawapps.ai) 平台的命令行认证工具。通过终端使用 Google 或 Apple 登录，Token 存储在本地供 AI Agent 和脚本使用。

## 安装

```bash
npm install -g @clawapps/cli
```

> **还未发布到 npm？** 从源码安装：
> ```bash
> git clone git@github.com:ClawApps/clawapps-cli.git
> cd clawapps-cli && npm install && npm run build && npm link
> ```

## 命令

### `claw login`

使用 Google 或 Apple 登录。自动打开浏览器完成 OAuth，Token 存储在本地。

```bash
$ claw login
? Choose login method: Google
Opening browser for Google login...
✔ Logged in as user@gmail.com
```

### `claw whoami`

查看当前账户信息。Token 过期时自动刷新。

```bash
$ claw whoami
ClawApps Account
──────────────────────────────
Name:     Username
Email:    user@gmail.com
ID:       xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Provider: google
```

### `claw logout`

登出并清除本地凭证。

```bash
$ claw logout
Logged out successfully.
```

## 工作原理

```
claw login
  → 选择 Google 或 Apple
  → 本地 HTTP 服务器启动 (localhost 随机端口)
  → 浏览器打开 OAuth 授权
  → 回调返回 Token 到本地服务器
  → Token 交换: Google/Apple → OpenDigits → ClawApps
  → 凭证保存到 ~/.clawapps/credentials.json (权限 0600)
```

**Google 流程**：隐式 OAuth → 本地回调页面从 URL hash 提取 Token → POST 到本地服务器 → 交换为 ClawApps Token。

**Apple 流程**：OpenDigits 处理 Apple OAuth → 重定向到本地回调，query 参数携带 Token → 交换为 ClawApps Token。

## 凭证存储

Token 存储在 `~/.clawapps/credentials.json`，文件权限 `0600`。

```json
{
  "provider": "google",
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "logged_in_at": "2026-02-24T11:11:35.871Z"
}
```

在脚本中使用：

```bash
TOKEN=$(cat ~/.clawapps/credentials.json | jq -r .access_token)
curl -H "Authorization: Bearer $TOKEN" https://api.clawapps.ai/api/v1/...
```

## 项目结构

```
clawapps-cli/
├── bin/claw.js                # 入口
├── src/
│   ├── index.ts               # Commander 命令注册
│   ├── commands/
│   │   ├── login.ts           # OAuth 流程编排
│   │   ├── logout.ts          # 清除凭证
│   │   └── whoami.ts          # 用户信息 (自动刷新 Token)
│   ├── auth/
│   │   ├── server.ts          # 本地 HTTP 回调服务器
│   │   ├── google.ts          # Google OAuth URL 构建
│   │   ├── apple.ts           # Apple OAuth URL 构建 (经由 OD)
│   │   └── exchange.ts        # Token 交换 (OD → ClawApps)
│   ├── lib/
│   │   ├── config.ts          # API 端点 & 常量
│   │   ├── credentials.ts     # 读写 ~/.clawapps/credentials.json
│   │   ├── api.ts             # HTTP 请求封装
│   │   └── types.ts           # TypeScript 接口定义
│   └── html/
│       ├── callback.ts        # OAuth 回调 HTML 模板
│       └── logo-data.ts       # Logo (base64 内嵌)
├── package.json
└── tsconfig.json
```

## 开发

```bash
npm install          # 安装依赖
npm run build        # 编译 TypeScript
npm run dev          # 监听模式
node bin/claw.js     # 本地运行
```

## 环境要求

- **Node.js >= 18**（使用原生 `fetch`）

## 相关项目

- [clawapps-skill](https://github.com/ClawApps/clawapps-skill) — ClawApps 平台的 Agent Skill 插件

## 参与贡献

1. Fork 本仓库
2. 创建特性分支（`git checkout -b feat/my-feature`）
3. 提交更改（使用 [Conventional Commits](https://www.conventionalcommits.org/)）
4. 推送并发起 Pull Request

## 许可证

[MIT](LICENSE) - Copyright 2026 ClawApps
