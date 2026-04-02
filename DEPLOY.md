# app-prodn Deploy

## Production truth

- VPS repo path: `/var/www/AoE2HDBets/app-prodn`
- service: `aoe2hdbets-web.service`
- public domain: `https://aoe2hdbets.com`
- bind: `127.0.0.1:3030`
- service user: `tony`
- preferred SSH alias from MBP: `hel1`

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

On VPS:

```bash
ssh hel1
cd /var/www/AoE2HDBets/app-prodn
git status --short
git pull --ff-only origin main
npm run build
```

Then restart as root:

```bash
sudo systemctl restart aoe2hdbets-web.service
systemctl is-active aoe2hdbets-web.service
journalctl -u aoe2hdbets-web.service -n 40 --no-pager
```

## Verification

Minimum deploy checks:

```bash
curl -I https://aoe2hdbets.com/
curl -I https://aoe2hdbets.com/lobby
curl -I https://aoe2hdbets.com/live-games
curl -I https://aoe2hdbets.com/challenge
curl -I https://aoe2hdbets.com/players
curl -I https://aoe2hdbets.com/contact-emaren
curl -s https://aoe2hdbets.com/api/lobby | jq '.leaderboard.trackedPlayers, (.leaderboard.entries | length)'
journalctl -u aoe2hdbets-web.service -n 20 --no-pager
```

For inbox attachment fixes, verify the actual binary route too:

```bash
# Requires a valid aoe2hdbets_session cookie from a real participant.
curl -I --cookie "aoe2hdbets_session=..." \
  https://aoe2hdbets.com/api/contact-emaren/attachments/<messageId>
```

Expected result:
- `200`
- correct binary `content-type` such as `image/webp`
- safe `content-disposition` with ASCII `filename=` and UTF-8 `filename*=`

## What matters most after deploy

The most important public product smoke tests are now:

1. `/lobby` loads cleanly
2. leaderboard renders and count matches entry length
3. tournament panel loads cleanly
4. `/live-games` responds
5. same-origin `/api/lobby` returns a believable snapshot shape

This matters more now than older homepage-only checks because the lobby/community shell is the real public spine.

## Known deploy gotchas

### Ownership drift

If `git pull` or `npm run build` fails with `Permission denied`, inspect file ownership before doing anything else.

Common symptoms:
- `error: unable to unlink old ... Permission denied`
- `EACCES` writing `.next/cache/images`
- one or more files under the app tree owned by `root`

Fast check:

```bash
ls -l app/api/contact-emaren/attachments/[messageId]/route.ts
ls -ld .next .next/cache .next/cache/images
```

Expected:
- app tree should normally be owned by `tony:tony`

Typical fix:

```bash
sudo chown -R tony:tony /var/www/AoE2HDBets/app-prodn
```

### Interrupted pulls

If a fast-forward pull dies partway through because of ownership drift, the repo can look locally modified even though it is just half-updated deployment state.

Recover deliberately:

```bash
git status --short
git diff --stat
git stash push -m interrupted-pull
git pull --ff-only origin main
git stash drop stash@{0}
```

Do not do this blindly if the VPS has intentional local changes.

### `next-env.d.ts` drift

This file still drifts on the VPS and has caused:

- local modifications in the server repo
- file ownership issues during builds
- manual `chown tony:tony /var/www/AoE2HDBets/app-prodn/next-env.d.ts`

Until fixed properly:

- expect `git status` on the VPS to sometimes show `M next-env.d.ts`
- stash or preserve it before pulling if needed

### Inbox attachments

Direct-message attachments are session-protected, so preview failures are not always frontend rendering bugs.

Check these in order:
- authenticated route response from `/api/contact-emaren/attachments/:id`
- `journalctl -u aoe2hdbets-web.service`
- `Content-Disposition` generation in the route

Known real failure:
- `TypeError: Cannot convert argument to a ByteString ...`

That points at Unicode header generation and should send you to the attachment route first, not the chat bubble component.

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
