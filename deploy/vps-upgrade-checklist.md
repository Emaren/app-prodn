# VPS Upgrade Checklist (AoE2HDBets)

Run this from the current VPS layout, not the old `/var/www/app-prodn` / `pm2` shape.

Current web truth:
- SSH alias from MBP: `hel1`
- web repo: `/var/www/AoE2HDBets/app-prodn`
- web service: `aoe2hdbets-web.service`
- web bind: `127.0.0.1:3030`
- web runtime user: `tony`

Current API truth:
- api repo: `/var/www/AoE2HDBets/api-prodn`
- api service: `aoe2hdbets-api.service`
- api bind: `127.0.0.1:3330`

## 1) Pull latest code

```bash
ssh hel1

cd /var/www/AoE2HDBets/app-prodn && git status --short && git pull --ff-only origin main
cd /var/www/AoE2HDBets/api-prodn && git status --short && git pull --ff-only origin main
```

## 2) Verify required env vars

### `/etc/aoe2hdbets/aoe2hdbets-web.env`

- `DATABASE_URL=...`
- `SESSION_SECRET=...`
- `AOE2_BACKEND_UPSTREAM=http://127.0.0.1:3330`
- `ADMIN_TOKEN=...`
- optional: `INTERNAL_API_KEY=...`

### `api-prodn` env file

Verify the actual file in service/config before editing. Do not assume the API still reads the old PM2 path.

- `DATABASE_URL=...`
- `ADMIN_TOKEN=...`
- optional: `INTERNAL_API_KEY=...`
- `AUTO_CREATE_TABLES=false`

## 3) Apply DB migrations (backend)

```bash
cd /var/www/AoE2HDBets/api-prodn
if [ -f venv/bin/activate ]; then source venv/bin/activate; else source .venv/bin/activate; fi
alembic upgrade head
```

## 4) Rebuild/restart services

```bash
cd /var/www/AoE2HDBets/app-prodn
npm run build
sudo systemctl restart aoe2hdbets-web.service
systemctl is-active aoe2hdbets-web.service

cd /var/www/AoE2HDBets/api-prodn
if [ -f venv/bin/activate ]; then source venv/bin/activate; else source .venv/bin/activate; fi
pip install -r requirements.txt
sudo systemctl restart aoe2hdbets-api.service
systemctl is-active aoe2hdbets-api.service
```

If `git pull` or `npm run build` fails with `Permission denied`, check ownership drift first:

```bash
ls -l /var/www/AoE2HDBets/app-prodn/app/api/contact-emaren/attachments/[messageId]/route.ts
ls -ld /var/www/AoE2HDBets/app-prodn/.next /var/www/AoE2HDBets/app-prodn/.next/cache
sudo chown -R tony:tony /var/www/AoE2HDBets/app-prodn
```

## 5) Confirm nginx routing model

- `aoe2hdbets.com/*` -> `127.0.0.1:3030` (Next)
- `api-prodn.aoe2hdbets.com/*` -> `127.0.0.1:3330` (FastAPI)

Template file:
- `/var/www/AoE2HDBets/app-prodn/deploy/nginx.conf.example`

Reload nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 6) Smoke checks

```bash
# App health path (via rewrite)
curl -I https://aoe2hdbets.com/
curl -I https://aoe2hdbets.com/lobby
curl -I https://aoe2hdbets.com/live-games
curl -I https://aoe2hdbets.com/challenge
curl -I https://aoe2hdbets.com/contact-emaren

# Traffic endpoint should reject anonymous access
curl -i https://aoe2hdbets.com/api/traffic

# Backend traffic endpoint should reject missing admin token
curl -i https://api-prodn.aoe2hdbets.com/api/traffic

# Backend traffic endpoint with admin token
curl -i -H "Authorization: Bearer $ADMIN_TOKEN" https://api-prodn.aoe2hdbets.com/api/traffic

# Web service logs
journalctl -u aoe2hdbets-web.service -n 40 --no-pager
```

For inbox attachment issues, verify the protected binary route directly with a real participant session cookie:

```bash
curl -I --cookie "aoe2hdbets_session=..." \
  https://aoe2hdbets.com/api/contact-emaren/attachments/<messageId>
```

If logs show `Cannot convert argument to a ByteString`, inspect `Content-Disposition` generation in the attachment route before touching the chat UI.

## 7) Watcher rollout

Set watcher env for users:

- `AOE2_API_BASE_URL=https://api-prodn.aoe2hdbets.com`
- optional: `AOE2_UPLOAD_API_KEY=...` (if backend `INTERNAL_API_KEY` enabled)
