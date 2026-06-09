# DEPLOY_DOCKER.md — dockerized devboard deploy

> Supersedes the systemd/`vite preview` flow in [DEPLOY_BOX4.md](DEPLOY_BOX4.md).
> The devboard now ships as a two-service docker-compose stack (backend +
> nginx-served frontend). Any host with Docker runs it; box4 is the current
> reference deployment.

## Topology

```
Cloudflare (Full strict) ──HTTPS──► box4:443 ─┐
                                              ├─ frontend container (nginx)
direct / health  ─────────HTTP───► box4:80  ─┘     ├─ static dist (SPA)
                                                   └─ proxy /api,/health ─► backend:8890
backend container ── Atlas (public)  +  box1/box2 health probes (Tailscale 100.x)
```

- `backend`: Express, bound 0.0.0.0 in-container, published to host `127.0.0.1:8890` only.
- `frontend`: nginx serves the built SPA and reverse-proxies `/api` + `/health` to `backend`.

## 1. Host prereqs

- Docker CE + compose plugin. On Alibaba Cloud Linux 3 (el8), the official
  `docker-ce` repo works once `$releasever` is pinned to `8`.
- For the MCP/nanobot health panels, the host must reach box1/box2 over
  Tailscale (`tailscale up`). **Aliyun gotcha:** Aliyun's internal DNS
  (`100.100.2.136/138`) lives in `100.64.0.0/10`, which Tailscale claims, so
  MagicDNS breaks public DNS. Fix: set `/etc/resolv.conf` to a public resolver
  outside that range (`223.5.5.5`/`223.6.6.6`) and `chattr +i` it. devboard
  reaches box1/box2 by IP, so MagicDNS is not needed.
- ~2 GB RAM is tight for the on-box `vite build` — add a swapfile first.

## 2. Get the code + .env

```bash
sudo mkdir -p /opt/Ola_devboard && sudo chown "$USER" /opt/Ola_devboard
# from a checkout: git archive HEAD | ssh host 'tar -x -C /opt/Ola_devboard'
cp .env.example .env   # then fill: DATABASE, DEVBOARD_PASSWORD, SESSION_SECRET,
                       # COOKIE_SECURE=1, MCP_HEALTH_URL / NANOBOT_*_URL (box1/box2
                       # Tailscale IPs), DEVBOARD_BIND_ADDR, DEVBOARD_HTTP_PORT
```

`.env` is `chmod 600`, never committed. `DEVBOARD_BIND_ADDR`/`DEVBOARD_HTTP_PORT`
control where the frontend is published (default `127.0.0.1:8080` so a shared
host is never disturbed; a dedicated host fronted by Cloudflare uses `0.0.0.0:80`).

## 3. Build + run (HTTP only)

```bash
cd /opt/Ola_devboard
# version.json gets real git metadata from these build args:
GIT_REV=$(git rev-parse --short HEAD 2>/dev/null || echo unknown) \
GIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo unknown) \
GIT_SHA_SHORT=$GIT_REV GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown) \
BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
docker compose build           # or: bash scripts/docker_build.sh  (when .git is present)
docker compose up -d
```

Verify: `curl -s http://127.0.0.1:${DEVBOARD_HTTP_PORT:-80}/api/version` reports
the running commit; `/api/dashboard/llm-usage` returns 401 without a cookie.

## 4. HTTPS via Cloudflare (Full strict) — opt-in TLS overlay

Use this when Cloudflare fronts the host in **Full (strict)**. It adds a `:443`
listener with a CF Origin Certificate; nothing else about the stack changes.

1. Cloudflare dashboard → SSL/TLS → Origin Server → **Create Certificate**
   (hostnames e.g. `devboard.olatech.ai` or `*.olatech.ai`).
2. On the host, drop the two PEMs into `./certs` (gitignored):
   ```bash
   install -m700 -d /opt/Ola_devboard/certs
   # paste Origin Certificate -> certs/origin.crt   (chmod 600)
   # paste Private Key        -> certs/origin.key   (chmod 600)
   ```
3. Make compose load the overlay by adding to `.env`:
   ```
   COMPOSE_FILE=docker-compose.yml:docker-compose.tls.yml
   ```
   (or pass `-f docker-compose.yml -f docker-compose.tls.yml` on every command).
4. `docker compose up -d` — the frontend now publishes `:80` and `:443`.
5. Open the host firewall / security group inbound **443**, and set the
   hostname's Cloudflare SSL mode to **Full (strict)**.

The TLS nginx config lives in [frontend/nginx.tls.conf](../frontend/nginx.tls.conf)
and the overlay in [docker-compose.tls.yml](../docker-compose.tls.yml). The cert
itself is per-host and never committed. Renewing the cert = replace the PEMs in
`./certs` and `docker compose up -d` (or restart the frontend).

> ⚠️ Shared zone: `olatech.ai` is shared with the CRM. Do not change the
> zone-wide CF SSL mode — scope per-hostname settings instead.
