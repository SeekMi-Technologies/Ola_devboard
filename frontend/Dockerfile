# Ola_devboard frontend image (Ola/#225 dockerize).
# Multi-stage: build the Vite bundle with node, then serve the static dist
# from nginx:alpine. The same nginx reverse-proxies /api and /health to the
# backend container, so the whole app is fronted by a single port 80 — this
# replaces both `vite preview` and the box-level nginx the bare-metal deploy
# used. Cloudflare fronts this port 80 over HTTPS (Flexible), same as box4.

FROM node:20-slim AS build
WORKDIR /app/frontend
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
