---
id: "aoe2war.app-prodn.kt84-we2-owner-cockpit"
title: "KT84 WE3-to-WE2 Signed Read-Only Cockpit Contract"
type: "runbook"
status: "active"
owner: "aoe2war-web"
systems: ["app-prodn", "kingdom-traders"]
audience: ["operators", "developers", "ai-agents"]
source_of_truth: "git"
authority: "nonfinancial-readonly-product-source-review"
reviewed_at: "2026-11-17"
review_interval_days: 14
sensitivity: "internal"
---

# KT84 WE3-to-WE2 Signed Read-Only Cockpit Contract

## Source and custody separation

WE2 consumes the **contract**, not the original money database or operator
private key. WE3 independent private project `Emaren/kingdom-traders` owns
KT84 PR #134 source
`ad376120dd012c396898f15915a9e0c0b2e760cb`, especially
`docs/KT84_STELLAR_PROVIDER_WALLET_CHROME_WE2_CONTRACT.md`.
KT84 originally exports source-owned owner-0600 historical JSON
`KT84_STELLAR_ONE_BOT_PRIVATE_READONLY_TELEMETRY_V1` based on the 353-file
original PAPER estate and 42 source SQLite DB audits. **This JSON is not
yet signed for WEB use, a running bot, a funded wallet, or a deployed
website.**

The source-certified historical one-bot account is **HALTED**, with
99.999845443923960000 modeled USDC after a small modeled loss; real orders
zero. WE3 has separately initialized a new original KT83 **PAUSED**
account (no signed RESUME, no actual order). A source claim is *not* an
authenticated current WE2 receipt. WE2 does not show new account
state as verified until a separate signed KT83 source input is admitted.

## WE2 frontend and API

- Protected `GET /kingdom-traders/cockpit` requires existing
  `requireServerAdmin()`. Anonymous and Scribe are denied using the
  existing source-auth gate. The public gateway remains publicly
  reachable and never leaks this backend state.
- Protected `GET /api/kingdom-traders/paper-readonly` uses existing
  `requireAdmin(request)`, owner-only no-cache with `Vary: Cookie`.
  **There are no POST/PUT/DELETE handlers.** Missing or unverified feed
  returns `503 HOLD_WE3_SIGNED_PROJECTION_NOT_ADMITTED`.
- The single Next.js website process renders six honest provider roles:
  Classic native orderbook, Soroswap AMM, Aquarius, Sushi, Comet and
  Soroswap Aggregator as a **router**, not a sixth independent reserve.
  Historic verified direct source exists only for Classic and Soroswap
  and cannot be treated as fresh executable quotes. Other amounts
  remain UNKNOWN. All execution lanes remain disabled.
- Fleet shows 100 design positions in ten-page groups, ten positions
  per page. Historical status is shown only with authentic signed
  history; no running worker inferred. Source-only KT84 text may explain
  old HALT but never populates live account cash from unsigned source.
- Freighter watch-only dock is explicit. No official SDK is installed
  here; disabled connect button is intentional until independently
  reviewed and pinned. No private wallet keys, XDR, command signer or
  wallet authority in the website.
- US$10 means **total** account exposure, not per bot. Reserve,
  XLM/USD, Soroban fee, compliance and spendable budget unknown ⇒ HOLD.

## Separately signed sanitized WE3 envelope — source proposal ONLY

WE3 must first independently publish a scrubbed, owner-approved projection
**from a separately authenticated read-only bridge**, not by handing
the website an original SQLite path. The website can only verify:

- Ed25519 public key `KT84_WE3_TELEMETRY_PUBLIC_PEM` (PUBLIC PEM
  only, not an operator private/signing key, not a financial custody key).
- Root-owned, non-writable-for-others, non-symlink regular file at
  `/var/lib/aoe2war-kt-readonly/kt84-public-projection-v1.json`;
  website gets read permission only. The root directory must be
  independently installed/attested. No filepath selected by HTTP
  request. No extra Next runtime, no arbitrary source upload.
- Envelope schema `aoe2war.kt84.we3-sanitized-ed25519.v1` with
  `sourceSha`, `signedAtUTC`, `expiresAtUTC`, `payload`, and
  `signatureBase64`, maximum 128 KiB. The signature is Ed25519
  over exact UTF-8 bytes of
  `AOE2WAR:KT84:WE3:SANITIZED:READONLY:V1\0` followed by a JSON
  serialization with **recursively sorted object keys**, canonical
  JSON strings, no NaN or non-JSON values, containing `schema`,
  `sourceSha`, `signedAtUTC`, `expiresAtUTC`, `payload`.
  `signatureBase64` itself is excluded. Signer must pin the exact
  expected KT84 commit, and an issued receipt must be within 24h and
  unexpired.
- `payload.schema` must equal WE3's exact historical telemetry
  schema and original study receipt SHA
  `0662f9da7be5d8e14e2fb48762872bd96f79c637fc7eb79781373086e14ff44f`.
  All provider/source/worker/fleet fields are separately checked.
  Any RUNNING, live, signed operator, actual funded, extra source,
  forged Classic liquidity or router liquidity claim fails closed.
- The WEBSITE projects an explicit allowlist of safe display fields,
  and never returns original raw envelope, private source paths,
  broker credentials, wallet secrets, operator signatures or money
  write capabilities. Missing trust metadata always means 503/UNKNOWN.

**Status as of this source proposal:** there is no approved WE3 signed
producer, no enrolled verifier public PEM, no installed root file and
no independent WE3-to-HEL1 signed transport. This is source implementation
plus adversarial tests, **not a claim that the cockpit displays actual
signed money today**. WE3 and Central Command must approve the
immutable schema and separate source installation before the producer
can fill this route. The website can deploy the UI fail-closed
before source admission, but must clearly show NOT ADMITTED.

The historical account must not be conflated with new KT83 account;
the latter needs a separately signed current financial/control
head, verified PAUSED operator journal and source-specific enrollment.
No PAPER daemon is started by this UI.

## Negative tests and future release

The WE2 source suite creates test-only Ed25519 pairs and proves
valid historical display, wrong key, modified payload, expired signature,
fake worker, fake research execution, router double-counting, invented
new fleet work, fake funded wallet and absent verifier all fail closed.

After the source lands on canonical main, **Emaren is the one human
owner approver**. A separate exact-artifact Factory permit is required
for release. Neither source admission nor generic owner instruction
changes the WE1 financial gates, WE3 historical estate or HEL1 root
installation authority. Browser acceptance must witness existing
authenticated Emaren, ordinary Scribe and guest roles without cookie
export. Real source observation and a live continuous bot remain
distinct next tasks.