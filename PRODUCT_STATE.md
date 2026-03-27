# app-prodn Product State

## Snapshot

This file captures the current shipped state of the public product surface so a new chat can resume without re-auditing everything.

## Strongest shipped modules

### Homepage / lobby

Current strengths:
- premium theme system with 7 theme circles
- live tournament/lobby shell
- leaderboard count now matches rendered entries
- claimed zero-match profiles can appear as `Pending`
- live chat loads to newest and no longer fights scrolling
- live SSE stream no longer throws the old closed-controller error on normal disconnects

### Players directory

Current strengths:
- clearer hierarchy
- live pulse / live status messaging
- all claimed profiles visible
- replay-built challengers separated clearly
- less clutter than earlier versions

### Contact Emaren

Current strengths:
- direct-line experience exists and is usable
- message receipts are quieter and more premium
- gifts and badges flow through chat
- unread counts and read state exist

### Admin command surface

Current strengths:
- can inspect users
- can award badges/gifts
- can see inbox/unread/honor state
- can see appearance preferences and recent actions

## Still unfinished

### Individual player pages

Need another pass:
- `/players/[uid]`
- `/players/by-name/[name]`

They work, but they are not yet as sharp as the homepage or directory.

### `$WOLO`

Current state:
- has a real page and UI surface
- gifts exist in app logic
- not yet true settlement / chain-complete behavior

### Replay trust / postgame depth

Current state:
- parser now captures much more replay metadata
- official HD rating snapshots are surfaced
- exact postgame achievement tabs still are not solved

If exact score/economy/military tables matter, likely next step is:
- screenshot ingestion / OCR
- or deeper HD-specific replay/postgame parsing

### Docs / testing / deploy hygiene

Still needed:
- API test baseline cleanup
- permanent fix for VPS `next-env.d.ts` drift
- keep runtime docs aligned as deploy flow evolves

## Current known product rough edges

- player profile pages lag behind directory polish
- admin dashboard is strong but not yet “ultimate”
- some pages still have more explanatory copy than ideal
- token rail is visually present faster than it is infrastructurally complete

## Current rough scorecard

- Homepage / Lobby: `9.4/10`
- Players directory: `9.2/10`
- Individual player pages: `7.1/10`
- Contact / inbox: `8.9/10`
- Admin dashboard: `8.7/10`
- Replay parser / metadata capture: `8.1/10`
- Exact postgame achievement capture: `4.1/10`
- Deploy reliability: `8.7/10`
- Docs / architecture truth: moving upward, but still worth maintaining intentionally

## Best next moves

1. Fix VPS `next-env.d.ts` drift permanently
2. Premium pass on individual player pages
3. Clean API testing workflow and restore a trustworthy baseline
4. Decide whether exact postgame achievement extraction is worth OCR/deeper parser work
