# Ola_devboard

Internal developer dashboard for Ola CRM — a small standalone Node/React app
that lets the engineering team see LLM token usage, user activity, MCP/nanobot
health, recent logs, and DB summary at a glance. Decoupled from the CRM
codebase so the product repo doesn't carry dev-only tooling.

> **Status — v0 feature-complete (D13, 2026-05-09)**: scaffold (D10) +
> backend (D11) + frontend (D12) + integration smoke (D13) all landed.
> See the CRM `task.md` for the full plan (gitignored, lives at
> `/Users/duke/Documents/GitHub/crm/task.md`). Production deployment +
> auth design is a separate follow-up issue and is intentionally not in
> v0 scope.

## What this repo is, and is not

| | This repo (Ola_devboard) | CRM repo (Ola) |
|---|---|---|
| Audience | engineering team | end customers |
| Auth (v0) | none — loopback bind 127.0.0.1 only | full admin auth |
| Data flow | **read-only** consumer of CRM telemetry | source of truth |
| Deployment | local dev only (v0); prod = follow-up issue | already in prod (Aliyun HK) |

**Hard rule (v0)**: devboard is read-only. No mongoose `.create / .insertOne /
.updateOne / .deleteOne / .findByIdAndUpdate / .save` anywhere in this repo.

## Quick start

```bash
# 1. clone + install
git clone https://github.com/SeekMi-Technologies/Ola_devboard.git
cd Ola_devboard
cp .env.example .env             # fill in DATABASE etc.
npm --prefix backend install
npm --prefix frontend install

# 2. start both processes (Ctrl-C kills both)
bash start-dev.sh

# 3. open the dashboard
open http://localhost:3001
```

You also need the CRM stack running locally (`bash ~/.../crm/start-dev.sh`)
because the dashboard probes loopback URLs and tails CRM's `backend/logs/mcp.log`.

## Ports

| Process | Port | Bind |
|---|---|---|
| CRM backend | 8888 | (CRM's choice) |
| MCP server | 8889 | loopback in dev |
| Nanobot serve | 8900 | loopback |
| Nanobot gateway | 8901 | loopback |
| **Devboard backend** | **8890** | **127.0.0.1 only** |
| **Devboard frontend** | **3001** | dev server |

## Cross-repo coupling (4 points — change with care)

These are the only places where this repo couples to the CRM repo. Any
breaking change here must be coordinated across both repos:

1. **`Admin.lastActivity` field shape** — CRM writes via `trackActivity`
   middleware; devboard reads in the User Activity panel.
2. **`LlmUsage` schema field names** — CRM writes per ask-ola turn; devboard
   reads in the LLM Usage and Email Token panels.
3. **`backend/logs/mcp.log` JSON-Lines format** — CRM's MCP audit logger
   produces the format; devboard tails the file in the Logs panel.
4. **MCP `127.0.0.1:8889/health` response format** — CRM exposes a public
   liveness probe; devboard reads it in the MCP Health panel.

If you change one, open a PR in BOTH repos in the same review pass.

## Repo structure

```
Ola_devboard/
├── README.md                     # you are here
├── .env.example                  # copy → .env
├── .gitignore
├── start-dev.sh                  # boots backend + frontend together
├── backend/
│   ├── package.json
│   ├── jest.config.js
│   ├── src/
│   │   ├── server.js             # listens 127.0.0.1:8890
│   │   ├── app.js                # Express + CORS + /health
│   │   ├── db.js                 # mongoose connect (D11)
│   │   ├── models/               # mirrored read-only schemas (D11)
│   │   ├── controllers/          # 6 panel handlers (D11)
│   │   └── utils/redactor.js     # secret-mask util (D11)
│   └── test/
│       ├── jest.setup.js
│       └── ...                    # jest + supertest (D11)
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx                # 6-tab shell
        ├── modules/               # panels (D12)
        ├── request/               # axios wrapper
        └── test-utils/
            └── setupAntdJsdom.js
```

## Environment variables

See `.env.example` for the full list. Key ones:

| Variable | Purpose | Required |
|---|---|---|
| `DATABASE` | Atlas connection string (same DB as CRM) | yes |
| `MCP_LOG_FILE_PATH` | absolute path to CRM's `backend/logs/mcp.log` | yes |
| `MCP_HEALTH_URL` | http://127.0.0.1:8889/health | default ok |
| `NANOBOT_SERVE_HEALTH_URL` | http://127.0.0.1:8900/health | default ok |
| `NANOBOT_GATEWAY_HEALTH_URL` | http://127.0.0.1:8901/health | default ok |
| `BACKEND_PORT` | 8890 | default ok |
| `FRONTEND_PORT` | 3001 | default ok |

## Architecture (data flow)

```
                 reads same Atlas DB
   ┌──────────────────────────────────────────────────┐
   │                                                  ▼
┌──┴───────────┐         ┌─────────────────┐    ┌──────────┐
│ CRM backend  │────────►│ MongoDB Atlas   │◄───│ Devboard │
│ :8888        │ writes  │ (LlmUsage,      │    │ backend  │
│              │         │  Admin, ...)    │    │ :8890    │
└──────┬───────┘         └─────────────────┘    └────┬─────┘
       │                                              ▲
       │ writes JSON-Lines                            │ tails (env
       ▼                                              │  MCP_LOG_FILE_PATH)
┌──────────────┐                                      │
│ backend/logs │──────────────────────────────────────┘
│ /mcp.log     │
└──────────────┘
       ▲
       │ exposes :8889/health
┌──────┴───────┐         probes loopback
│ MCP server   │◄──────────────────────────┐
│ :8889        │                            │
└──────────────┘                            │
                                            │
┌──────────────┐                            │
│ Devboard     │ requests /api/dashboard/* ─┘
│ frontend     │
│ :3001        │
└──────────────┘
```

CRM produces telemetry; devboard reads it. The 4 coupling points (see
above) are the only contract surface — keep them stable across both
repos.

## Running tests

```bash
npm --prefix backend test         # jest + supertest (~56 cases)
npm --prefix frontend test        # vitest + @testing-library/react (3 cases)
bash backend/test/integration/test_devboard_smoke.sh   # 8-T live curl smoke
```

Layers:
| Layer | What it catches | When to run |
|---|---|---|
| jest unit (per-controller) | aggregation math, Joi shapes | every commit |
| jest e2e (`test/e2e.test.js`) | Express wiring, end-to-end shape | every commit |
| jest read-only invariant (`test/readOnly.test.js`) | future write-method regressions | every commit |
| vitest App-level (`src/App.test.jsx`) | panel imports + tab switching | every commit |
| smoke shell | live HTTP against the running backend | before push |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `bash start-dev.sh` says `.env` not found | Fresh clone | `cp .env.example .env` and fill in `DATABASE` |
| Backend boots but `db-summary` returns 503 | `DATABASE` env wrong / Atlas unreachable | Re-check `.env` against the same string the CRM uses |
| `Logs` panel shows "MCP_LOG_FILE_PATH not configured" | Env unset | Point it at your CRM checkout: `MCP_LOG_FILE_PATH=/Users/.../crm/backend/logs/mcp.log` |
| `MCP Health` panel shows all three down | CRM stack not running | `cd ~/.../crm && bash start-dev.sh` in another terminal |
| `MCP` only is down, nanobot two are up (or vice versa) | Real outage — investigate | This is the panel doing its job |
| Frontend port 3001 occupied | Stale `vite` from a previous run | `lsof -iTCP:3001 -sTCP:LISTEN` then kill |
| Backend port 8890 occupied | Stale node | `lsof -iTCP:8890 -sTCP:LISTEN` then kill |
| smoke shell fails T8 (`mongodb://` leak) | `db-summary` controller regression | Hard regression — investigate before merge |
| Push to `origin/main` returns 403 | Git fell back to wrong HTTPS credential | Switch remote to SSH: `git remote set-url origin git@github.com:SeekMi-Technologies/Ola_devboard.git` |

## Deployment

**v0 = local only.** Production deployment is a separate follow-up issue.
When we get there we'll need to design at least:

- An auth layer (loopback bind isn't enough off-localhost). Options: shared
  CRM JWT cookie, dedicated Atlas read-only user, or Tailscale ACL + token.
- A dedicated Atlas read-only user instead of sharing CRM's full `DATABASE`.
- A way for devboard to reach CRM's `mcp.log` when they're on different
  hosts (probably forwarded log file or shipped via Loki/Vector).

Don't deploy this anywhere outside a dev box yet.

## Owners

- **Ziyue 殷子越** (`ziyue.yin908@gmail.com`) — primary
- **Yuandong 张元东** — review / approve

Workflow follows the same SDD discipline as the CRM repo (plan → revise →
approve → backlog → execute → test → push), but without the `.claude/skills/`
automation that CRM has.
