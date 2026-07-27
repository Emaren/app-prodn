---
id: "aoe2war.app-prodn.docs-audits-wolo-duplicate-tx-audit-2026-06-05"
title: "WOLO Duplicate Tx Audit - 2026-06-05"
type: "historical"
status: "historical"
owner: "aoe2war-web"
systems: ["app-prodn","wolochain"]
audience: ["operators","auditors","ai-agents"]
source_of_truth: "historical-evidence"
authority: "audit-evidence"
reviewed_at: "2026-07-26"
review_interval_days: 0
sensitivity: "restricted"
---

# WOLO Duplicate Tx Audit - 2026-06-05

## Mainnet settlement state

- WoloChain mainnet settlement service is healthy on `127.0.0.1:8092`.
- Authenticated grouped payout validation works.
- `/etc/aoe2hdbets/aoe2hdbets-web.env` sources cleanly after quoting `NEXT_PUBLIC_WOLO_CHAIN_NAME="WoloChain Mainnet"`.

## Julio correction

Julio wallet:

`wolo1n0yg6ltqxl05ljaqftvvtgec5qavf9a3uh090h`

Julio chain balance after correction:

`2009 WOLO`

Claim `411`:

- status: `claimed`
- amount: `1000 WOLO`
- tx: `CC8F7D27DD30C87C286341B856653B51A6B90DCFEDDC279DC759C5061FE60031`
- valid. Chain tx contains exactly one `1000 WOLO` send to Julio.

Claim `417`:

- was incorrectly marked claimed using the same `CC8F` tx.
- `CC8F` only paid claim `411` once.
- reset to pending with `duplicate_tx_hash_corrected_retry_needed` and should be retried as a fresh `1000 WOLO` payout.

## Proven suspicious mainnet duplicates reset

These rows were proven duplicate-paid from single-send mainnet txs and reset to pending/review:

- claim `403` reused `AE735...`, but that tx only paid claim `395`.
- claim `405` reused `54134...`, but that tx only paid claim `396`.
- claim `407` reused `99EF...`, but that tx only paid claim `397`.

Claims `405` and `407` may be duplicate-market noise because they share `source_game_stats_id=6529` with already-paid rows. They require admin review before retry.

## Remaining duplicate groups

Remaining duplicate claimed tx hashes are legacy/testnet:

- They 404 on mainnet REST `127.0.0.1:1318`.
- They are found on testnet REST `127.0.0.1:1317`.
- Each inspected tx contains only one `MsgSend`.
- Multiple app claim rows point to the same single-send tx.

These must be classified as legacy/testnet duplicates and excluded from mainnet accounting until reviewed.

## App fixes shipped

- Claim settlement retry and automatic market settlement now verify the returned tx contains a distinct matching WoloChain `MsgSend` before marking any claim row `claimed`.
- Reused payout tx hashes are blocked unless the tx has enough distinct matching sends for every claimed app row using that hash.
- Admin duplicate diagnostics classify groups as `MAINNET_VERIFIED_MULTI_PAYOUT`, `MAINNET_SUSPICIOUS_DUPLICATE`, `LEGACY_TESTNET_SINGLE_SEND_DUPLICATE`, or `REST_NOT_FOUND`.
- Profile WOLO ledger separates confirmed mainnet transfer rows from app-side pending/retry claim rows, keeps newest-first ordering, and flags duplicate/suspicious tx groups.
- Settlement queue activity uses individual child claim rows instead of market-collapsed aggregate rows.
- Admin settlement messaging no longer treats a stale generic "not configured" row as live truth when current settlement health is `ok=true` and `chain_id=wolo-1`.
- `/admin/wolochain` flags direct mainnet REST txs that are missing from `wolo_indexed_transfers`; this is the current diagnostic path for why `CC8F...` could be REST-visible but not indexed.
