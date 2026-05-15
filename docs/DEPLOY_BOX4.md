# DEPLOY_BOX4.md — Ola_devboard 部署 box4 SOP

> **Issue**: SeekMi-Technologies/Ola#225
> **Audience**: Yuandong / Ziyue 一次性操作员
> **Scope**: 把 Ola_devboard 从 `main` 部署到 box4，开 simple auth，启版本号管理 + 热更新脚本

## 0. 拓扑

| Item | Value |
|---|---|
| Box4 公网 IP | `47.89.243.254` |
| Box4 root 凭据 | 见 `crm/.secrets/SERVERS.env` `BOX4_*` |
| 公网域名（建议） | `devboard.olatech.ai`（Cloudflare managed） |
| Backend 端口 | 8890（dev loopback；prod `BACKEND_HOST=0.0.0.0`） |
| Frontend 端口 | 3001（`vite preview`） |
| 部署目录 | `/opt/Ola_devboard` |
| 配置文件 | `/opt/Ola_devboard/.env`（gitignored，`chmod 600`） |
| 进程 | `devboard-backend.service` + `devboard-frontend.service`（systemd） |

## 1. 一次性前置（仅首次）

### 1.1 Box4 系统依赖

```bash
ssh root@47.89.243.254
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git nginx
node --version  # v20.x
npm --version
```

### 1.2 Tailscale 接入（决策 D3）

box4 必须接 mesh，否则 MCP/nanobot health probe 拿不到 box1/box2 的 100.x.x.x。

```bash
ssh root@47.89.243.254
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey="<TAILSCALE_AUTHKEY from .secrets/SERVERS.env>"
tailscale ip   # 看到 100.x.y.z — 记下来
```

接入后回本地，把 `BOX4_TS_IP=100.x.y.z` 加到 `crm/.secrets/SERVERS.env`。

### 1.3 .env 准备（本地）

```bash
cd Ola_devboard
cp .env.example .env
```

填以下 keys（来源标在右侧）：

| Key | Value 提示 | 来源 |
|---|---|---|
| `DATABASE` | Atlas connection string | `crm/.secrets/SERVERS.env` `DATABASE` |
| `DEVBOARD_PASSWORD` | 单密码（zyd 选定） | manual |
| `SESSION_SECRET` | 32 字节 hex | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `COOKIE_SECURE` | `1`（公网 + CF HTTPS） | const |
| `BACKEND_HOST` | `0.0.0.0`（公网监听） | 仅 prod |
| `BACKEND_PORT` | `8890` | default |
| `FRONTEND_PORT` | `3001` | default |
| `MCP_HEALTH_URL` | `http://100.109.220.126:8889/health` | box1 Tailscale IP |
| `NANOBOT_SERVE_HEALTH_URL` | `http://100.83.72.110:8900/health` | box2 Tailscale IP |
| `NANOBOT_GATEWAY_HEALTH_URL` | `http://100.83.72.110:8901/health` | box2 Tailscale IP |
| `MCP_LOG_FILE_PATH` | 空（graceful degrade，D4） | const |

⚠️ **绝不 commit .env**。`chmod 600 .env`。

## 2. 首次 deploy

本地 `Ola_devboard/` repo 根：

```bash
brew install hudochenkov/sshpass/sshpass   # macOS, 一次性
SERVERS_ENV=../crm/.secrets/SERVERS.env bash scripts/deploy_box4.sh
```

脚本依次：

1. box4 prereq 检查（node/npm/git）
2. clone 或 fast-forward `/opt/Ola_devboard`
3. scp `.env`（仅当 box4 上没有）
4. install + daemon-reload 两个 systemd unit
5. 跑 `hot_update.sh`（npm ci + build + restart + smoke）
6. `systemctl enable` 两个 unit

预期结尾：

```
=== deploy_box4: done ===
```

如失败，看 stderr 第一行 → 按 §7 排错。

## 3. 部署后验证

```bash
ssh root@47.89.243.254
systemctl status devboard-backend devboard-frontend   # 两个 active (running)
curl -sS http://127.0.0.1:8890/health
curl -sS http://127.0.0.1:8890/api/version            # commit hash 与本地 origin/main HEAD 一致
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8890/api/dashboard/llm-usage   # 401（auth gate 生效）
curl -sS -X POST -H 'Content-Type: application/json' \
  -d "{\"password\":\"$DEVBOARD_PASSWORD\"}" \
  http://127.0.0.1:8890/api/auth/login                # 200 + Set-Cookie devboard_session
```

公网（CF 走完 §4 后）：

```bash
curl -sS https://devboard.olatech.ai/health
curl -sS https://devboard.olatech.ai/api/version
```

## 4. nginx + Cloudflare（公网 HTTPS）

### 4.1 box4 上 nginx

`/etc/nginx/sites-available/devboard`：

```nginx
server {
    listen 80;
    server_name devboard.olatech.ai;

    location /api/ {
        proxy_pass http://127.0.0.1:8890;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:8890/health;
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
ln -s /etc/nginx/sites-available/devboard /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

### 4.2 Cloudflare DNS

- A record: `devboard.olatech.ai` → `47.89.243.254`，Proxy = **ON**（橙云）
- SSL/TLS mode: **Flexible**（CF terminates HTTPS, talks HTTP to box4:80）

DNS 生效后：

```bash
curl -sS https://devboard.olatech.ai/health
# {"ok":true,"ts":...,"service":"ola-devboard-backend","version":"0.1.0"}
```

## 5. 后续 hot-update

box4 上：

```bash
ssh root@47.89.243.254
bash /opt/Ola_devboard/scripts/hot_update.sh
```

幂等：同 commit 跑两次只是 npm ci no-op + restart。Output 含 before/after commit hash + /health + /api/version。

## 6. 回滚

```bash
ssh root@47.89.243.254
cd /opt/Ola_devboard
git log --oneline -5            # 找上一个 good commit
git reset --hard <good-commit>
bash scripts/build_version.sh   # 刷新 version.json
systemctl restart devboard-backend devboard-frontend
curl -sS http://127.0.0.1:8890/api/version   # 确认回到 good commit
```

## 7. 排错

| 症状 | 排查 |
|---|---|
| `systemctl status` 显示 `failed` | `journalctl -u devboard-backend.service -n 100 --no-pager` |
| `/api/version` 显示 `rev=unknown` | `bash /opt/Ola_devboard/scripts/build_version.sh` 没跑 → 手动跑一次 |
| `/api/dashboard/*` 返回 500 | `DATABASE` env 未设或 Atlas 连不上 → `grep DATABASE /opt/Ola_devboard/.env` |
| Logs panel 在浏览器空 | `MCP_LOG_FILE_PATH` 未设（本意如此，D4 graceful degrade）|
| MCP Health panel 全红 | box4 没接 Tailscale 或 url 错 → `tailscale ip` 看 box4 IP，`curl http://100.109.220.126:8889/health` 看 box1 |
| 浏览器 cookie 不持久 | `COOKIE_SECURE=1` 但访问的是 HTTP → 改 0 或走 HTTPS |
| Login 401 even with correct password | `DEVBOARD_PASSWORD` 没设或 mismatch → `grep DEVBOARD_PASSWORD /opt/Ola_devboard/.env` |
| `vite preview` 起不来 | 没 `npm run build` 过 → 跑 `cd /opt/Ola_devboard/frontend && npm run build` |
| nginx 502 | 后端没起 → `systemctl status devboard-backend` |

## 8. 本次 issue 显式不做（升新 issue）

- Logs panel 远程 tail（box4 没本地 `mcp.log`，本次走 graceful degrade）
- 多用户 / 角色 / 审计日志
- GitHub webhook 自动部署
- Box4 OS 监控、日志归档、备份
- HTTPS termination 在 box4 本机（仍走 CF Flexible）
- Box4 防火墙规则细化（默认 ufw allow 80 + 22）

## 9. 安全 checklist（首次上线前过一遍）

- [ ] `/opt/Ola_devboard/.env` 模式 `600`
- [ ] `DEVBOARD_PASSWORD` 不在 git history 任何地方
- [ ] `SESSION_SECRET` ≥ 32 字符且非默认
- [ ] `COOKIE_SECURE=1` 且 CF Proxy = ON
- [ ] `BACKEND_HOST=0.0.0.0` + nginx 反代 80（不直接暴露 8890）
- [ ] box4 防火墙仅允许 22/80（443 由 CF 终结，可不开）
- [ ] `/api/dashboard/*` 无 cookie 时 401（公网 curl 验证）
- [ ] Cloudflare WAF 默认规则 enabled
