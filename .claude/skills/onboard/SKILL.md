---
name: onboard
description: Identify the Ola_devboard operator (Ziyue / Yuandong), report current git branch state, surface the cross-repo backlog cursor from CRM's task.md, and route to /spec. Use at the start of every fresh Ola_devboard session, when the user identifies themselves, asks "what should we do?", or types /onboard.
---

# Onboard — Ola_devboard 上车

> **用户什么语言, 你就用什么语言.** User writes Chinese → reply Chinese. User
> writes English → reply English. Mixed → mirror dominant. Code identifiers
> stay English regardless.

## 1. 问身份 — 第一件事

> 你好，我是 Ola_devboard 的 AI 开发伙伴。在开始之前，请问你是谁？

匹配下面这张表才能继续。**绝不假设是谁**。

| 名字 / 别名 | 模式 | 默认下一步 |
|---|---|---|
| 殷子越 / Ziyue / 子越 | 🟢 全栈对等（**无 trivial 豁免**） | `/spec` 必走，任何改动都要 PLAN→APPROVE |
| 张元东 / Yuandong / zyd / Duke / 元东 | 🟢 reviewer / push approver | trivial fix 可直接动手；push 由他批 |
| Will / Angel / lzy | ❌ 不接触本仓库 | 礼貌指回 CRM repo |

**如果是 Will / Angel / lzy**：devboard 没有 UI/UX 或 feedback 角色。礼貌说明这是
内部 dev 工具，他们关心的工作（产品 UI / 客户反馈）都在 CRM 仓库 (`../crm/`)，
请到那边发起。

## 2. 跑 repo 状态 — 报告给用户

并行执行，给一句话总结：

```bash
git branch --show-current                      # 应当 = main
git status --short
git log origin/main..HEAD --oneline            # 未推 commits
git log HEAD..origin/main --oneline            # 落后于 main → 提示 pull
gh issue list --repo SeekMi-Technologies/Ola --state open --search "label:dashboard OR 220 OR devboard" --limit 5
```

读 [task.md](task.md)（gitignored，本地工作文档）—— 本仓库当前 plan 状态。
**注意**：dashboard 项目的真权威 backlog 在 CRM 的 `~/Documents/GitHub/crm/task.md`
里（D10/D11/D12/D13 各项）。如果 CRM `task.md` 存在，简略报一下相关项进度。

向用户报告（不超过两句）：
> 当前 [branch]，[N] 个未推 commit，CRM task.md 上 [D项 状态]，GitHub 有 [M] 个跟
> dashboard 相关的 open issue。今天做什么？

**Branch 检查**：devboard v0 只有 `main` 分支。在其他 branch 上立刻指出
（可能是历史遗留 / 误操作）。

## 3. 红线 — 永远生效

不管在做什么任务，这些不能触：

- ❌ **写 mongoose**: 任何 `.create / .insertOne / .insertMany / .updateOne /
  .updateMany / .findOneAndUpdate / .findByIdAndUpdate / .deleteOne /
  .deleteMany / .findOneAndDelete / .findByIdAndDelete / .replaceOne /
  .bulkWrite / .save`。本仓库是 read-only。`backend/test/readOnly.test.js`
  会 grep 你的代码 fail-fast
- ❌ **off-loopback bind**: `server.js` 必须 `app.listen(PORT, '127.0.0.1', ...)`。
  改 `0.0.0.0` 或外部 IP 是硬阻塞 —— 没 auth 之前不可暴露
- ❌ **Silent error**: 任何失败必须有明确错误信息。没有 `catch(e){}` 空处理
- ❌ **`setTimeout` 替代异步**: 用真正的 async/await
- ❌ **新 npm dep**: 守 zyd 红线，**任何新依赖**要先问
- ❌ **emoji**: code / config / panel label 一律不加（feedback_no_emoji_in_product memory）
- ❌ **改 `.env`**: 不直接编辑 `.env`，告诉 operator 加什么
- ❌ **跨 repo write**: 永远不从 devboard 修改 CRM 代码。CRM 端 bug 走 GitHub
  issue 或 CRM 仓库自己的 session
- ✅ **CRM 数据是真源**: devboard 永远是消费者
- ✅ **接口走 `request/` 封装**: 不直接 `axios` / `fetch` 在 panel 里

## 4. Cross-repo coupling 4 点 — 改这些要同时 PR 两 repo

| # | Field / Contract | CRM 角色 | Devboard 角色 |
|---|---|---|---|
| 1 | `Admin.lastActivity` | CRM `trackActivity` 写 | devboard User Activity panel 读 |
| 2 | `LlmUsage` schema | CRM `recordUsage` 写 | devboard LLM Usage / Email Token 读 |
| 3 | `mcp.log` JSON Lines 格式 | CRM `mcp/logger.js` 写 | devboard Logs panel tail |
| 4 | MCP `/health` 响应 shape | CRM `mcp/server.js` 暴露 | devboard MCP Health 探 |

任何一条改动 = 两个 repo 各开一个 PR，同一审。

## 5. 我未经允许不会做

- `git push`（必须先问 "可以 push 了吗?" 等明确 OK；devboard 是新 repo，初次
  push 尤其敏感）
- 合并 PR
- 改 `.env*`、`docker-compose.yml`（devboard v0 没 compose，但万一加了同理）
- 删 commit / `git push --force` / `git reset --hard`
- 引入新 npm 依赖
- SSH 上服务器（v0 = 本地，根本没服务器）

## 6. 路由 — 按身份决定下一步

- **Ziyue** 任何改动（包括单行 typo）→ `/spec` 必走完 PLAN→APPROVE 才动手。
  **没有 trivial 豁免**
- **Yuandong** 加新功能 / 改后端 → `/spec` 走 6 phase。trivial single-line
  fix → 可直接动手（Phase 5 EXECUTE + Phase 6 TEST 仍要走，永不豁免）
- **Will / Angel / lzy** → 礼貌指回 CRM
- **改完、验证通过、想提交** → 任何 operator 都用 `/ship`

## 7. 项目速查（用得上时引用）

- **定位**: 仅供 Ola 工程师用的 internal dev dashboard。read-only，v0
  loopback-only。**不是产品代码**
- **栈**: Node 20 + Express + mongoose；React 18 + Vite + AntD；jest 30 +
  vitest
- **数据**: 连 CRM 的同一个 Atlas Mongo（`DATABASE` env 共享）；mcp.log
  通过文件系统（`MCP_LOG_FILE_PATH` env）
- **运行**: `bash start-dev.sh` 一键起 backend (8890) + frontend (3001)
- **同胞仓库**: `../crm/` 是 CRM，`../nanobot/` 是 NanoBot Python；这两个 repo
  我们**只读**

## 8. 真理源（重要）

- **本 skill 是 Claude Code 工作流的真理源** for this repo。同类 3 个 skill 在
  [.claude/skills/](.claude/skills/) 下：`onboard`（本文）/ `spec` / `ship`
- **CRM 的 `.claude/skills/` 不是本仓库的子集**：CRM 有 `ui-tweak`（Will/Angel
  专用）和 `deploy`（zyd 部署），devboard 都没有 —— 因为相关角色 / 操作不存在
- **不读 `.agents/`**：那是 CRM 给 Antigravity 准备的，本仓库不存在
- **想看真实的代码模板** → 直接读 codebase（如 [backend/src/controllers/_aggregations.js](backend/src/controllers/_aggregations.js)
  是聚合 helper 的活样本；[backend/src/controllers/logs.js](backend/src/controllers/logs.js) 是
  Joi-gated + maskSecrets-applied controller 的样板）

## 9. 完成 onboard 后

报告完 repo 状态 → 等用户说今天做什么 → 按 §6 路由到 `/spec`。**onboard
本身不写代码、不动文件**，只识别 + 报告 + 路由。
