# Ola_devboard

Internal developer dashboard for Ola CRM — a small standalone Node/React app that
shows the engineering team LLM token usage, user activity, MCP/nanobot health,
recent logs, and a DB summary at a glance. It is a **read-only** consumer of CRM
telemetry, decoupled from the product repo so the CRM doesn't carry dev-only tooling.

**Live:** <https://devboard.olatech.ai> — Dockerized, deployed on box4 behind
Cloudflare (Full strict). Access is gated by a single shared password (session cookie).

## Hard rule — read-only

Devboard never writes to the database. No mongoose `.create / .insertOne /
.updateOne / .deleteOne / .findByIdAndUpdate / .save` anywhere — the jest
static-grep guard [`backend/test/readOnly.test.js`](backend/test/readOnly.test.js)
fails the build if a write method sneaks in.

## Local development

```bash
git clone https://github.com/SeekMi-Technologies/Ola_devboard.git
cd Ola_devboard
cp .env.example .env        # fill DATABASE, DEVBOARD_PASSWORD, SESSION_SECRET
bash start-dev.sh           # boots backend (8890) + frontend (3001); Ctrl-C stops both
open http://localhost:3001
```

The MCP Health and Logs panels read CRM's loopback health URLs and tail its
`mcp.log` (`MCP_LOG_FILE_PATH`); they degrade gracefully when the CRM stack
isn't running locally.

## Deploy (Docker)

The app is a two-service docker-compose stack — backend + an nginx-served
frontend that also proxies `/api`. On any host with Docker:

```bash
cp .env.example .env        # DATABASE, DEVBOARD_PASSWORD, SESSION_SECRET, COOKIE_SECURE, ...
docker compose build        # version.json gets the real commit via build args
docker compose up -d        # frontend publishes per DEVBOARD_BIND_ADDR / DEVBOARD_HTTP_PORT
```

That's the whole thing for an HTTP host. For HTTPS behind Cloudflare (Full
strict), drop a CF Origin Certificate into `./certs` and enable the opt-in TLS
overlay ([docker-compose.tls.yml](docker-compose.tls.yml)). Full guide — build
args, Tailscale for the health panels, the Aliyun/Tailscale DNS gotcha — is in
**[docs/DEPLOY_DOCKER.md](docs/DEPLOY_DOCKER.md)**. Reference deployment: box4
(us-west-1) → <https://devboard.olatech.ai>.

## Ports

| Service | Port | Notes |
|---|---|---|
| Devboard backend | 8890 | published to host loopback only |
| Devboard frontend | 3001 (dev) · 80 / 443 (prod) | vite dev server / nginx |
| CRM backend · MCP · nanobot | 8888 · 8889 · 8900–8901 | read/probed, never written |

## Cross-repo coupling (4 points — change with care)

The only contract surface with the CRM repo. A breaking change to any of these
must land in **both** repos in the same review pass:

1. `Admin.lastActivity` shape — CRM `trackActivity` writes; User Activity panel reads.
2. `LlmUsage` field names — CRM `recordUsage` writes; LLM Usage / Email Token panels read.
3. `backend/logs/mcp.log` JSON-Lines format — CRM MCP logger writes; Logs panel tails.
4. MCP `:8889/health` response shape — CRM exposes; MCP Health panel probes.

## Config & tests

- **Env:** see [.env.example](.env.example). Required: `DATABASE`,
  `DEVBOARD_PASSWORD`, `SESSION_SECRET`. Health-probe URLs and `MCP_LOG_FILE_PATH`
  are optional (panels degrade gracefully). Set `COOKIE_SECURE=1` behind HTTPS.
- **Tests:** `npm --prefix backend test` (jest + supertest) ·
  `npm --prefix frontend test` (vitest). The read-only invariant runs in the
  backend suite.

## Owners

- **Ziyue 殷子越** (`ziyue.yin908@gmail.com`) — primary
- **Yuandong 张元东** — review / approve

Same SDD discipline as the CRM repo (plan → revise → approve → backlog → execute
→ test → push), driven by `.claude/skills/{onboard,spec,ship}`.
