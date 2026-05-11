# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Read this first — what this repo is, and is not

**Ola_devboard is an internal developer dashboard, not a product.** It exists to
let the Ola engineering team see LLM token usage, MCP/nanobot health, recent
audit logs, user activity, and DB summary at a glance. It is a **read-only
consumer** of CRM telemetry — never the source of truth.

| | This repo (`Ola_devboard`) | CRM repo (`Ola`) — sibling at `../crm/` |
|---|---|---|
| Audience | engineering team | end customers (paying B2B users) |
| Mode | **read-only** (mongoose reads + filesystem tail) | full read-write product backend |
| Auth (v0) | **none — loopback bind 127.0.0.1 only** | full JWT cookie via `adminAuth.isValidAuthToken` |
| Deploy | local dev only (v0); prod = follow-up issue | already in prod (Aliyun HK + CF + Tailscale) |
| SDD skills | `.claude/skills/{onboard,spec,ship}` | `.claude/skills/{onboard,spec,ship,ui-tweak,deploy}` |

The full plan for this repo's roll-out (D10 scaffold → D11 backend → D12 frontend
→ D13 close) lives in the **CRM repo's `task.md`** (gitignored at
`~/Documents/GitHub/crm/task.md`). That single document is the authoritative
backlog for the dashboard decoupling work tracked in Ola issue #220.

## Hard rules (always-on)

1. **Read-only.** Never call `.create / .insertOne / .insertMany / .updateOne /
   .updateMany / .findOneAndUpdate / .findByIdAndUpdate / .findOneAndReplace /
   .deleteOne / .deleteMany / .findOneAndDelete / .findByIdAndDelete /
   .replaceOne / .bulkWrite / .save` on any mongoose model. There is a
   `backend/test/readOnly.test.js` static-grep guard — adding a write
   operation to a controller will fail jest before it ships.
2. **Bind 127.0.0.1 only.** `backend/src/server.js` listens on `'127.0.0.1'`
   explicitly. Do not change to `0.0.0.0` or any other address without first
   adding real auth — production exposure is a separate follow-up issue.
3. **No new npm dependencies.** Same red line as CRM. If a panel needs a new
   dep, raise it explicitly with Ziyue before installing.
4. **No silent errors.** Every catch returns a specific message. No
   `catch(e){}`. No `setTimeout` pretending to be async. No `// @ts-ignore`.
5. **No hardcoded secrets.** Everything via env. `.env` is gitignored;
   `.env.example` is the committed template.
6. **No emoji in code, configs, or panel labels** unless explicitly asked
   (`feedback_no_emoji_in_product` memory).
7. **Never edit `.env` directly.** Tell the operator what to add. The
   only file we write env values to is `.env.example` (placeholders).

## Cross-repo coupling (4 points — change with care)

These are the **only** places this repo couples to CRM. Any breaking change
must be coordinated across **both** repos in the same review pass:

1. **`Admin.lastActivity` field shape** — CRM `trackActivity` middleware
   writes it on every authenticated request (throttled ≥60s/admin);
   devboard's User Activity panel reads it. Schema mirror in
   `backend/src/models/Admin.js` (slim, strict:false).
2. **`LlmUsage` schema field names** — CRM `recordUsage.js` writes per
   Ask Ola turn; devboard's LLM Usage and Email Token panels read.
   Schema mirror in `backend/src/models/LlmUsage.js`. Collection name
   pinned to `'llmusage'` (NOT mongoose's default pluralisation).
3. **`backend/logs/mcp.log` JSON-Lines format** — CRM `mcp/logger.js`
   writes; devboard's Logs panel tails via `MCP_LOG_FILE_PATH` env.
4. **MCP `127.0.0.1:8889/health` response shape** — CRM `mcp/server.js`
   exposes; devboard's MCP Health panel probes.

If you change one of these on the CRM side, the devboard panel that consumes
it will silently drift (mongoose schemas are `strict:false` on read here).
The safety mechanism is: open PRs on **both** repos in the same review pass.

## Project

Ola — AI-native foreign-trade ERP/CRM. Ola_devboard is the dev-only
operational dashboard, decoupled from CRM main in CRM commit `09ef44e` /
PR #221 (Ola/#220).

### Stack

- **Backend**: Node 20 + Express 4 + mongoose 8 + Joi. Jest 30 +
  supertest + mongodb-memory-server for tests. `module-alias` for `@/`
  imports (matches CRM convention).
- **Frontend**: React 18 + Vite 5 + Ant Design 5. Vitest + Testing
  Library + jsdom for tests. Axios for HTTP (via `request/` wrapper,
  vite proxy to backend).
- **Data**: Atlas MongoDB (same cluster as CRM via shared `DATABASE` env).

### Ports

| Service | Port | Bind |
|---|---|---|
| Devboard backend | 8890 | **127.0.0.1 only** |
| Devboard frontend | 3001 | dev server |
| CRM backend | 8888 | (sibling repo) |
| MCP server | 8889 | (sibling repo) |
| Nanobot serve | 8900 | (sibling) |
| Nanobot gateway | 8901 | (sibling) |

### Common commands

Backend (`cd backend`):
- `npm run dev` — nodemon on `src/server.js`
- `npm start` — production start
- `npm test` — `jest --runInBand`

Frontend (`cd frontend`):
- `npm run dev` — Vite dev server on 3001 (proxies `/api` → 8890)
- `npm run build` / `npm run preview`
- `npm test` — `vitest run`

Top-level:
- `bash start-dev.sh` — boots backend + frontend together; Ctrl-C kills both
- `cp .env.example .env` (then fill DATABASE etc.)

## SDD discipline

This repo follows the same SDD loop as CRM (PLAN → REVISE → APPROVE →
BACKLOG → EXECUTE → TEST → PUSH), enforced via `.claude/skills/`:

- **`/onboard`** — identity gate (Ziyue / Yuandong only) + repo state +
  cross-repo backlog cursor (looks at CRM's `task.md`) + route to `/spec`
- **`/spec`** — 6-phase SDD loop. Same red lines as CRM, plus the
  devboard-specific ones above (read-only / loopback bind)
- **`/ship`** — atomic commit + push (asks for explicit zyd OK) +
  PR to `main` (devboard has no `dev` branch)

`task.md` is gitignored (per-machine work doc, same convention as CRM).
The authoritative backlog for #220-related work lives in CRM's `task.md`,
not here — devboard has no separate plan document.

## Identity gate (ask "你是谁?" at the start of a new conversation)

| Name / alias | Role | Notes |
|---|---|---|
| **Ziyue / 殷子越** | primary operator | full-stack peer; **no trivial 豁免** — every change walks all 6 SDD phases |
| **Yuandong / zyd / Duke / Duke** | reviewer / push approver | gate-keeps every git push (same rule as CRM) |
| Will / Angel / lzy | NOT operators here | devboard has no UI/UX or feedback role; redirect to CRM |

## Cross-repo workflow

- **Never modify CRM from this repo's session.** If you find a CRM bug
  while working here, file a GitHub issue or update CRM's `task.md`
  via a separate session.
- **Schema or contract change at one of the 4 coupling points** = open
  PRs on BOTH repos in the same review pass; do not merge one without
  the other.
- **Production deployment** is a separate follow-up issue. The current
  v0 design is local-only — devboard never deploys without first adding
  auth, picking a hosting story, and switching off the loopback bind.

## What lives where (mental model)

| Path | In git? | Purpose |
|---|---|---|
| `backend/src/models/` | yes | slim mongoose mirrors of CRM's collections (read-only) |
| `backend/src/controllers/` | yes | 6 panel handlers + `_aggregations.js` helper |
| `backend/src/utils/redactor.js` | yes | secret-mask util (CRM had its own copy; we duplicate by design) |
| `backend/test/readOnly.test.js` | yes | static-grep guard against write methods |
| `frontend/src/modules/DevDashboardModule/panels/` | yes | 6 React panels |
| `start-dev.sh` | yes | one-command boot |
| `.env.example` | yes | committed env template |
| `.env` | **no** (gitignored) | per-machine secrets — never commit |
| `task.md` | **no** (gitignored) | per-machine work doc — CRM's `task.md` is the authoritative one |
| `.claude/projects/` | **no** (gitignored) | per-user Claude memory — never commit |
| `~/Documents/GitHub/crm/` | (separate repo) | source of truth for data shape + deployment context |

## Owners

- **Ziyue 殷子越** (`ziyue.yin908@gmail.com`) — primary
- **Yuandong 张元东** — review / push approval

Workflow mirrors CRM. The `.claude/skills/` automation here is a subset
of CRM's (no `ui-tweak`, no `deploy`) because the operator set + the
deployment story are both narrower in this repo.
