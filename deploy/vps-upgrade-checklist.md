# VPS Upgrade Checklist (AoE2HDBets)

Run this on the VPS to apply the latest app/api hardening.

## 1) Pull latest code

```bash
cd /var/www/app-prodn && git pull origin main
cd /var/www/api-prodn && git pull origin main
```

## 2) Verify required env vars

### `/var/www/app-prodn/.env.production`

- `DATABASE_URL=...`
- `SESSION_SECRET=...`
- `AOE2_BACKEND_UPSTREAM=http://127.0.0.1:3330`
- `ADMIN_TOKEN=...`
- optional: `INTERNAL_API_KEY=...`

### `/var/www/api-prodn/.env.production`

- `DATABASE_URL=...`
- `ADMIN_TOKEN=...`
- optional: `INTERNAL_API_KEY=...`
- `AUTO_CREATE_TABLES=false`

## 3) Apply DB migrations (backend)

```bash
cd /var/www/api-prodn
if [ -f venv/bin/activate ]; then source venv/bin/activate; else source .venv/bin/activate; fi
alembic upgrade head
```

## 4) Rebuild/restart services

```bash
cd /var/www/app-prodn
npm install
npm run build
pm2 startOrReload ecosystem.config.js --only app-prodn --update-env

cd /var/www/api-prodn
if [ -f venv/bin/activate ]; then source venv/bin/activate; else source .venv/bin/activate; fi
pip install -r requirements.txt
pm2 startOrReload ecosystem.config.js --only api-prodn --update-env
```

## 5) Confirm nginx routing model

- `aoe2hdbets.com/*` -> `127.0.0.1:3004` (Next)
- `api-prodn.aoe2hdbets.com/*` -> `127.0.0.1:3330` (FastAPI)

Template file:
- `/var/www/app-prodn/deploy/nginx.conf.example`

Reload nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 6) Smoke checks

```bash
# App health path (via rewrite)
curl -i https://aoe2hdbets.com/api/health

# Traffic endpoint should reject anonymous access
curl -i https://aoe2hdbets.com/api/traffic

# Backend traffic endpoint should reject missing admin token
curl -i https://api-prodn.aoe2hdbets.com/api/traffic

# Backend traffic endpoint with admin token
curl -i -H "Authorization: Bearer $ADMIN_TOKEN" https://api-prodn.aoe2hdbets.com/api/traffic
```

## 7) Watcher rollout

Set watcher env for users:

- `AOE2_API_BASE_URL=https://api-prodn.aoe2hdbets.com`
- optional: `AOE2_UPLOAD_API_KEY=...` (if backend `INTERNAL_API_KEY` enabled)
