# Ola_devboard

Internal developer dashboard for Ola CRM — a small standalone Node/React app
that lets the engineering team see LLM token usage, user activity, MCP/nanobot
health, recent logs, and DB summary at a glance. Decoupled from the CRM
codebase so the product repo doesn't carry dev-only tooling.

> **Status — D10 scaffold (2026-05-09)**: this is the skeleton commit. Real
> panel implementations land in D11 (backend) and D12 (frontend). See the
> CRM `task.md` for the full plan (gitignored, lives at
> `/Users/duke/Documents/GitHub/crm/task.md`).

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

## Running tests

```bash
npm --prefix backend test         # jest + supertest
npm --prefix frontend test        # vitest + @testing-library/react
bash backend/test/integration/test_devboard_smoke.sh   # added in D13
```

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
