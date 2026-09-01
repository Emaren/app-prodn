# WOLO Faucet Security

## Security model

The WOLO faucet is application-layer infrastructure. WoloChain consensus is not
responsible for faucet eligibility.

A faucet payout requires:

- a valid signed AoE2WAR session;
- a Steam-linked AoE2WAR account;
- an eligible authenticated-account cooldown;
- an eligible destination-address cooldown;
- no active persistent faucet circuit breaker.

Changing or generating a new WOLO address does not create a new faucet
entitlement.

## August 18, 2026 Sybil raid

On August 18, 2026, an automated campaign exploited the former address-only
faucet cooldown.

Observed incident evidence:

- 653 successful faucet payouts;
- 2 WOLO per payout;
- 1,306 WOLO gross faucet outflow;
- activity spanning roughly 7 hours 45 minutes;
- median active claim spacing of about 5 seconds;
- peak observed rate of 13 successful claims in one minute;
- 647 recipient wallets subsequently moved funds onward;
- 644 recipient wallets converged toward one common destination.

The evidence is overwhelmingly consistent with automated generation of fresh
wallet addresses followed by repeated faucet claims and consolidation.

The available retained evidence does not establish why the campaign stopped.
There is no proven defensive rejection corresponding to a hypothetical claim
654.

## Root cause

The former implementation treated destination address as the effective faucet
eligibility identity.

A new address therefore bypassed the 24-hour cooldown.

Authenticated user identity existed in the request path but was not required as
the economic authorization boundary for the payout.

## Hardening

The hardened faucet adds layered controls:

1. Signed-session identity is mandatory.
2. The account must have a linked Steam identity.
3. Cooldown is enforced per authenticated account.
4. Cooldown remains enforced per destination address.
5. A pre-broadcast reservation binds both account and destination.
6. Claims are serialized through an application lock.
7. Uncertain broadcasts remain fail-closed for the reserved account and address.
8. Only confirmed payouts count toward global payout ceilings.
9. Default circuit-breaker ceilings are 30 confirmed claims/hour and
   100 confirmed claims/day.
10. Once tripped, the breaker remains closed until explicit operator review.
11. Malformed security ledgers fail closed.
12. Ledger writes use atomic replacement.

## Circuit-breaker recovery

Do not reset the breaker merely because users report that the faucet is closed.

First inspect the event, recent claims, chain transactions, service logs, and
faucet hot-wallet state.

Production breaker state:

    storage/wolo-faucet/circuit-breaker.json

Recovery procedure:

1. Confirm the triggering claim pattern is understood.
2. Confirm no active abuse is continuing.
3. Preserve a timestamped copy of the breaker file for incident evidence.
4. Remove the active breaker file only after operator review.
5. Exercise one controlled legitimate claim.
6. Confirm account cooldown, destination cooldown, transaction truth, and
   telemetry.
7. Continue observing before declaring the incident closed.

Never hard-fork WoloChain or rewrite chain history merely to recover ordinary
faucet losses. Any chain-level intervention requires separate explicit
governance.

## Security invariants

The regression suite must continue proving:

- same account plus fresh wallet -> blocked;
- fresh account plus used wallet -> blocked;
- expired account cooldown -> eligible;
- fresh account plus fresh wallet -> eligible;
- uncertain reservation protects its destination from another account;
- uncertain reservations do not count as confirmed payouts;
- confirmed hourly and daily ceilings trip the breaker;
- an active breaker blocks claims;
- account-and-destination reservation occurs before chain broadcast;
- internal failures are not exposed to clients.
