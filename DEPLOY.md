# app-prodn Deploy

## Production truth

- VPS repo path: `/var/www/AoE2HDBets/app-prodn`
- service: `aoe2hdbets-web.service`
- public domain: `https://aoe2hdbets.com`
- bind: `127.0.0.1:3030`
- service user: `tony`

## Current systemd behavior

Base unit:

- `/etc/systemd/system/aoe2hdbets-web.service`

Restart tuning drop-in:

- `/etc/systemd/system/aoe2hdbets-web.service.d/restart-tuning.conf`

Current restart tuning:

- `KillSignal=SIGKILL`
- `KillMode=process`
- `TimeoutStopSec=2`
- `SuccessExitStatus=9 SIGKILL`

This exists because normal Next shutdowns were hanging and making deploys flaky.

## Standard deploy flow

From MBP:

```bash
git -C /Users/tonyblum/projects/AoE2HDBets/app-prodn push origin main
```

On VPS, as `tony`:

```bash
cd /var/www/AoE2HDBets/app-prodn
git pull --ff-only origin main
npm run build
```

Then restart as root:

```bash
systemctl restart aoe2hdbets-web.service
systemctl is-active aoe2hdbets-web.service
```

## Verification

Minimum deploy checks:

```bash
curl -I https://aoe2hdbets.com/
curl -I https://aoe2hdbets.com/lobby
curl -I https://aoe2hdbets.com/live-games
curl -I https://aoe2hdbets.com/players
curl -I https://aoe2hdbets.com/contact-emaren
curl -s https://aoe2hdbets.com/api/lobby | jq '.leaderboard.trackedPlayers, (.leaderboard.entries | length)'
journalctl -u aoe2hdbets-web.service -n 20 --no-pager
```

## What matters most after deploy

The most important public product smoke tests are now:

1. `/lobby` loads cleanly
2. leaderboard renders and count matches entry length
3. tournament panel loads cleanly
4. `/live-games` responds
5. same-origin `/api/lobby` returns a believable snapshot shape

This matters more now than older homepage-only checks because the lobby/community shell is the real public spine.

## Known deploy gotcha

`next-env.d.ts` drift

This file still drifts on the VPS and has caused:

- local modifications in the server repo
- file ownership issues during builds
- manual `chown tony:tony /var/www/AoE2HDBets/app-prodn/next-env.d.ts`

Until fixed properly:

- expect `git status` on the VPS to sometimes show `M next-env.d.ts`
- stash or preserve it before pulling if needed

## When schema changes exist

If the web change depends on new Prisma tables or columns:

- apply the web Prisma migration first
- then build
- then restart

Do not restart blindly before the schema is in place.

## Related runtime truth

- backend upstream should remain `http://127.0.0.1:3330`
- browser should stay same-origin for `/api/*`
- watcher uploads should continue to target `api-prodn.aoe2hdbets.com`, not the public web host