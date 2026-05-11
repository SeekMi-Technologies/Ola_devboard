---
name: spec
description: Spec-Driven Development loop for Ola_devboard — runs the 6-phase cycle (PLAN → REVISE → APPROVE → BACKLOG → EXECUTE → TEST) for any non-trivial code change. Enforces the APPROVE gate, task.md discipline, devboard-specific red lines (read-only, loopback bind, no new deps), and the verification pattern (jest + vitest + curl). Use when starting any backend or frontend work, or any change that touches one of the four cross-repo coupling points (Admin.lastActivity / LlmUsage / mcp.log / MCP /health).
---

# Spec — Ola_devboard Spec-Driven Development

> **用户什么语言, 你就用什么语言.** Code identifiers stay English.
>
> **Read-only over write. Bind loopback over expose. Boring over clever.**

## 0. 谁能 trivial 豁免

| 操作者 | trivial 豁免（跳 Phase 1-3） | 何时算 trivial |
|---|---|---|
| Yuandong | ✅ 允许 | 单文件 + 单一关心点 + 零业务逻辑变化（CSS 数值、变量重命名、注释修正、单行 typo） |
| Ziyue | ❌ **从不允许** | zyd 的明确决定，跨 repo 一致。任何改动都走完 PLAN→APPROVE 才动手 |

碰多于 1 个文件、碰任何 controller / model / 配置文件 → 不 trivial。
**Phase 5（EXECUTE）+ Phase 6（TEST）永远不可豁免，对所有人。**

## 1. 6 Phase 循环

```
用户需求 → PLAN → REVISE → APPROVE → BACKLOG → [EXECUTE → TEST → /ship] × N
```

### Phase 1: PLAN

不写代码。复述用户的理解 → 列要改/新建的文件路径 → 每个文件的 import 依赖
→ 列方案文字描述 → 列验收标准。涉及多于 3 个不相关文件 → 建议拆分。多方案
时给 pros/cons。

**特别提醒（devboard 特有）**：如果改动涉及 4 个 cross-repo coupling 点之一，
**PLAN 必须明确写出**："这个改动是否需要在 CRM 仓库同步开 PR？" —— 否则
schema 漂移是静默 bug。

### Phase 2: REVISE

用户改方案，来回多次。按反馈修方案，不抢着写代码。直到用户满意。

### Phase 3: APPROVE — 硬门

用户**明确说**「approved / 开始 / 可以 / 没问题 / 干 / 上」之后才进 Phase 4。

- ❌「行吧」「嗯」「ok」**不算** — 再问一次「我开始？」
- ❌「我先快速试一下」**不算** — 试就是 EXECUTE，没 APPROVE 不能
- ❌ 隐含同意（用户没说不就是默许）**绝对不算**
- ✅ 仅限 Yuandong：「直接改」算（trivial 豁免范围内）

### Phase 4: BACKLOG

拆成 [task.md](../../../task.md) 里的独立 backlog item。task.md 是 gitignored
工作文档，永不 commit。

**注意 cross-repo backlog**: dashboard 项目（#220 系列）的真权威 backlog 在
CRM 的 `~/Documents/GitHub/crm/task.md` 里（D10-D13）。如果当前工作属于那批，
**不复制到本仓库 task.md**——直接在 CRM task.md 里更新状态，避免双源真相。
本仓库 task.md 留给 devboard 独立的小修小补。

每个 item:
- **独立可验证** — 完成后能立刻测试
- **Atomic = function-level，不是 file-level** — 一个 function-level 改动跨
  5 文件也归一个 item（schema mirror + controller + test 一起改的话不能拆，
  否则中间状态不一致）。`≤3 文件` 是软目标
- **明确验收** — 具体到能 curl / npm test / vite build 验
- 状态：`[ ]` todo · `[/]` in-progress · `[x]` done · `[!]` blocked

### Phase 5: EXECUTE — 一次只做一件事

从 task.md 取第一个 `[ ]` → 标 `[/]` → **只做这一个 item**，不顺手修别的。
逐文件实现，每个文件改完一句话说明动机。

发现 out-of-scope 问题 → 加到 task.md 「Discovered tech debt」段或 GitHub
issue，**不当场修**。这一条违反就是漂移的开始。

特别提醒（cross-repo）：如果 EXECUTE 中发现需要改 CRM 端某个 telemetry 写
入逻辑（如 LlmUsage schema 加字段），**立刻停下**，回 CRM 仓库起新的 backlog
item，不当场跨 repo 改。

### Phase 6: TEST — 永不豁免

按 item 验收标准验证。devboard 的测试栈：

- **后端逻辑**: `cd backend && npm test`（jest 30 + supertest +
  mongodb-memory-server，runInBand）。新加 controller 必须配 jest 文件。
  `readOnly.test.js` grep-style 检查会自动 fail-fast 如果你 accidental 加
  了 mongoose write 方法
- **HTTP 接口**: curl **至少 3 条断言**（不接受"endpoint 不 500 就算过"）：
  1. Happy path → `success: true` + 期望的 result shape
  2. Negative case → 400 + 具体 message（Joi 边界等）
  3. **Second call after protocol entry** — 比如 limit 边界 + 不同 query
     range 切换
- **前端**: `cd frontend && npm run build` 必过；`cd frontend && npm test`
  （vitest + jsdom）。新加 panel 至少在 `src/App.test.jsx` 加一条 tab 切换
  断言
- **集成**: `bash backend/test/integration/test_devboard_smoke.sh`（如果存在）
  跑通

通过 → 问用户「可以 push 了吗?」→ 等明确 OK → [/ship](../ship/SKILL.md) →
标 `[x]` → 回 Phase 5。
失败 → 修到通过，**不跳下一个**。

## 2. 横切红线（写代码时这些是底线）

[/onboard](../onboard/SKILL.md) §3 列了完整红线。写代码时这些必须过：

- **Backend (mongoose / Express)**:
  - **Read-only** — 任何 `.create / .insertOne / .insertMany / .updateOne /
    .updateMany / .findOneAndUpdate / .findByIdAndUpdate / .findOneAndReplace
    / .deleteOne / .deleteMany / .findOneAndDelete / .findByIdAndDelete /
    .replaceOne / .bulkWrite / .save` 一律不能出现在 `backend/src/`。
    `readOnly.test.js` 静态 grep 会 fail
  - **Bind 127.0.0.1 only** — `server.js` 的 listen 调用必须显式 `'127.0.0.1'`
    作为 host 参数
  - 响应 shape 必须 `{ success, result, message }`（成功失败都是）
  - 错误码：400 输入错 / 404 不存在 / 500 系统错。不滥用 500
  - 输入用 Joi schema 校验（在 controller 入口）
  - 所有 controller 用 `safe(handler)` 包装（在 `src/app.js`）— 未捕获异常
    统一 500，不泄露 stack
- **Frontend**:
  - API 走 `src/request/` 封装，不直接 `axios` / `fetch` 在组件里
  - 只用 AntD，不引 Material UI / Chakra / Tailwind
  - 不用 Redux（panel 是局部 state；devboard 没 cross-page 状态需要全局存）
  - 组件 PascalCase，文件名和组件名一致
- **通用**:
  - No silent catch — 每个 catch 块返回具体错误
  - No `setTimeout` 假装异步 — 用真 async/await
  - 不引入新 npm 依赖（要先说理由 + 等同意）
  - 不写 emoji（feedback_no_emoji_in_product memory）

**模板就在 codebase 里，不要凭记忆写：**
- Controller (Joi + aggregate + envelope) → [backend/src/controllers/llmUsage.js](../../../backend/src/controllers/llmUsage.js)
- 时间窗聚合 helper → [backend/src/controllers/_aggregations.js](../../../backend/src/controllers/_aggregations.js)
- File-tail + Joi + redactor 综合 → [backend/src/controllers/logs.js](../../../backend/src/controllers/logs.js)
- mongoose 只读 schema 镜像 → [backend/src/models/LlmUsage.js](../../../backend/src/models/LlmUsage.js)
- jest + mongodb-memory-server pattern → [backend/test/llmUsage.test.js](../../../backend/test/llmUsage.test.js)
- supertest e2e → [backend/test/e2e.test.js](../../../backend/test/e2e.test.js)
- readOnly grep-style guard → [backend/test/readOnly.test.js](../../../backend/test/readOnly.test.js)
- 前端 panel (request + state + table) → [frontend/src/modules/DevDashboardModule/panels/LlmUsagePanel.jsx](../../../frontend/src/modules/DevDashboardModule/panels/LlmUsagePanel.jsx)
- App-level vitest → [frontend/src/App.test.jsx](../../../frontend/src/App.test.jsx)

## 3. Cross-repo change 升级路径 — 触到立刻停

碰下面任意一个，**停止 EXECUTE，明确告诉 Ziyue 这是 cross-repo 改动，
等显式 go-ahead**：

- `Admin.lastActivity` 字段定义改变（CRM 写者 / devboard 读者）
- `LlmUsage` schema 任意字段重命名 / 删除 / 类型变更
- `backend/logs/mcp.log` JSON Lines 格式变更（在 CRM 的 `mcp/logger.js`）
- MCP `127.0.0.1:8889/health` 响应 shape 变更
- 任何 controller 加 mongoose write 方法（破 read-only 红线）
- 改 `server.js` 的 `app.listen` host 参数

任一触发 → 先停 → 起 cross-repo backlog item → 两边各开 PR → 同一审。

## 4. Infra-change 升级路径

碰下面任意一个，停下问 Ziyue：

- `package.json` 加新 dep
- `vite.config.js` 改 proxy / port / 移除 strictPort
- `jest.config.js` 改 moduleNameMapper
- `.env.example` 加新必需 key
- `start-dev.sh` 改启动流程

## 5. 出口

- 当前 item Phase 6 通过 → 问「可以 push 了吗?」→ Ziyue / Yuandong 明确 OK
  → [/ship](../ship/SKILL.md) → 标 `[x]` → 回 Phase 5 拿下一个 `[ ]`
- task.md 所有 item `[x]` → [/ship](../ship/SKILL.md) 创建 PR 到 main
  （devboard 没 dev branch）
- 中途遇 §3 cross-repo 触发 → 停 → 起两个 repo 的协同 backlog
- 中途遇 §4 infra 触发 → 停 → 等 Ziyue 明确批
