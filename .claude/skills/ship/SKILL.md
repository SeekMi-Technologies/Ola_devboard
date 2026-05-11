---
name: ship
description: Atomic commit + push + PR for Ola_devboard. Auto-detects operator (Ziyue / Yuandong), runs pre-commit code review against the devboard red lines (read-only / loopback bind / no new deps), asks for explicit push authorization, pushes to main, and creates a PR (devboard has only one branch — main — so PRs land directly on it). Use after any backlog item passes Phase 6 verification. Never push without asking first — this is a hard zyd protocol mirrored from CRM.
---

# Ship — Ola_devboard atomic commit + push + PR

> **用户什么语言, 你就用什么语言.**

## 0. Preconditions — refuse if any of these fail

Before any commit / push:

- [ ] Phase 6 TEST 通过（jest + vitest + 浏览器手测 if UI-relevant）
- [ ] `git -C ~/Documents/GitHub/Ola_devboard status --short` 干净于无关文件
- [ ] 当前 branch = `main`（devboard 没有 feature branch convention v0）
- [ ] 改动符合 [/spec](../spec/SKILL.md) §2 横切红线
- [ ] 改动没触 [/spec](../spec/SKILL.md) §3 cross-repo coupling 4 点；
      如果触了，确认 CRM 端 PR 已存在或同时准备

任一不过 → 拒绝 ship，告诉用户哪一步 fail，要求修复。

## 1. Identity → author = Ziyue (locked)

`git config --local user.email` 必须是 `ziyue.yin908@gmail.com`，
`git config --local user.name` 必须是 `Ziyue Yin`。如果当前不是，先修：

```bash
git -C ~/Documents/GitHub/Ola_devboard config --local user.name "Ziyue Yin"
git -C ~/Documents/GitHub/Ola_devboard config --local user.email "ziyue.yin908@gmail.com"
```

不修 global config（其他 repo 不受影响）。Yuandong 操作也以 Ziyue 名义 commit，
因为这个仓库的代码所有权和 ship 流程都属于 Ziyue。

## 2. Pre-commit code review — 自审一次

读 git diff，自审下面这张表：

| 检查项 | 怎么自审 |
|---|---|
| Read-only 红线 | `git diff` 里没出现 `.create(` / `.insertOne(` / `.updateOne(` / `.deleteOne(` / `.findByIdAndUpdate(` / `.save(` |
| Loopback bind | `server.js` 的 `app.listen` 没改 host 参数 |
| 新 npm dep | `package.json` `dependencies` / `devDependencies` 没新增项 |
| Cross-repo coupling | 没改 `models/LlmUsage.js` 或 `models/Admin.js` 的字段名（如改了，必须 CRM 端同步） |
| `.env` 没动 | `.env.example` 可以加，`.env` 永远不动 |
| 注释引用 | 没出现 `#220 D6` 这类 task 引用（task ref 留在 commit message / PR description） |
| Emoji | code / config / panel label 一律没 emoji |

任一可疑 → 暂停，问用户是否有意 / 是否要 revert。

## 3. Commit message format

```
<type>(<scope>): <subject> (#<crm-issue>)

<body — 解释 why，不只是 what>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

`<type>`: `feat / fix / chore / docs / test / refactor`
`<scope>`: 一般是 `backend` / `frontend` / `infra` / `decouple` 等粗粒度
`#<crm-issue>`: 引用对应 CRM issue（如 `Ola/#220`），因为 devboard 没自己的
issue tracker（用 CRM 的）

通过 HEREDOC 传 commit message 保证格式：

```bash
git -C ~/Documents/GitHub/Ola_devboard commit -m "$(cat <<'EOF'
feat(backend): port mcp-health endpoint (Ola/#220 D11)

Body explaining the why, the cross-repo impact, the verification.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

## 4. Push authorization — 硬门

**Before `git push`**, must ask:

> 可以 push 了吗?

等用户**明确**说「可以 / push / 上 / OK」之后才推。「嗯」「行」不算（同 spec
APPROVE 节奏）。

- Yuandong 在场：他直接说 OK 即可
- 只有 Ziyue：Ziyue 自己确认 OK 即可（这是她自己的仓库；CRM 那边才需要 zyd
  push 协议，因为 CRM 是共享产品代码）

Push 命令:

```bash
git -C ~/Documents/GitHub/Ola_devboard push origin main
```

## 5. PR — 仅当 PR 模式适用

Devboard v0 只有 `main` 分支，没有 dev 分流。意味着：

- 大多数 commits **直接 push 到 main**（小修小补、单一 atomic backlog item）
- **PR 流程**仅在 cross-repo coupling 改动时启用：那时需要让 reviewer 看到
  本仓库 + CRM 仓库改动的关系。流程：在本地切 feature branch
  → push → 起 PR 到 main → reviewer 确认 → 合并

PR 适用场景 checklist:

- [ ] 改动触了 cross-repo coupling 4 点中任一
- [ ] 改动 ≥ 3 个 atomic backlog item（大批量更适合 PR 一次审）
- [ ] reviewer (Yuandong) 不在线，需要异步审

不适用 PR → 直接 push main + commit message 写清楚 + 跟 Yuandong 说一声。

PR 创建命令（如果走 PR 流程）:

```bash
gh pr create --repo SeekMi-Technologies/Ola_devboard \
  --title "<commit subject>" \
  --body "$(cat <<'EOF'
## Summary
<1-3 bullet points>

## Cross-repo impact
- [ ] no coupling field changed
- [ ] OR: CRM PR linked — <link>

## Test plan
- [ ] jest pass: <count>
- [ ] vitest pass: <count>
- [ ] manual browser verified by <name>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## 6. Post-push housekeeping

Push 成功后:

- 更新本地 `task.md` 把对应 item 从 `[/]` 改 `[x]`
- 如果 commit 闭合了 CRM `task.md` 里的某项（D10-D13 等），**也去 CRM
  task.md 改**，因为那是真权威 backlog
- 报告短信式总结给用户：commit hash + 推到哪 + task 状态

## 7. 不会做的事（重申）

- ❌ Push without explicit OK
- ❌ Push to 一个不存在的远端 branch 或 force push
- ❌ 改 `.env` 内容
- ❌ Skip pre-commit hooks (`--no-verify`)
- ❌ 跨 repo commit（一次 commit 只动一个 repo）
- ❌ 删别人的 commit / `git reset --hard` / `git push --force`
