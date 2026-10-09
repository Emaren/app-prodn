// Read-only positive-presence Watcher display snapshot for reconciliation.
// Some qualified display rows are frozen, pre-fix unsigned compatibility.
// Never describe every row as signed or interpret absence as definitive.
import { createHash } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { loadCurrentWatcherAccountStates } from "@/lib/currentWatcherAccountState";
import {
  loadVerifiedWatcherSteamRatings,
  selectLatestSteamObservation,
} from "@/lib/verifiedWatcherSteamRatings";

const prisma = getPrisma();
const digest = x => createHash("sha256").update(x).digest("hex");
const exactSteam = x => typeof x === "string" && /^[0-9]{17}$/.test(x);
const validRating = x => Number.isInteger(x) && x > 0 && x <= 5000;
const validTime = x => typeof x === "string" &&
  Number.isFinite(Date.parse(x)) && x.endsWith("Z");

try {
  const proof = await prisma.$queryRawUnsafe(
    "SELECT current_setting('transaction_read_only') AS transaction_mode, " +
    "current_setting('default_transaction_read_only') AS default_mode",
  );
  if (!Array.isArray(proof) || proof.length !== 1 ||
      proof[0].transaction_mode !== "on" || proof[0].default_mode !== "on")
    throw Error("STOP: absent read-only database proof");

  // Existing display rails, no new qualification or mutable rating writes.
  const [receiptRows, verifiedDisplayRows] = await Promise.all([
    loadCurrentWatcherAccountStates(prisma),
    loadVerifiedWatcherSteamRatings(prisma),
  ]);
  if (!Array.isArray(receiptRows) || !Array.isArray(verifiedDisplayRows))
    throw Error("STOP: invalid qualified display snapshot");

  const byId = new Map();
  function insert(id, label, row) {
    if (!exactSteam(id) || byId.get(id)?.[label])
      throw Error("STOP: invalid/duplicate Steam identity in display rail");
    const existing = byId.get(id) ?? {};
    existing[label] = row;
    byId.set(id, existing);
  }
  for (const row of receiptRows) insert(row.steamId, "receipt", row);
  for (const row of verifiedDisplayRows)
    insert(row.steamId, "verifiedDisplay", row);

  const rows = [];
  for (const [id, entry] of byId) {
    const a = entry.receipt, b = entry.verifiedDisplay;
    const rm = selectLatestSteamObservation(
      a?.steamRmRating ?? null, a?.steamRmObservedAt ?? null,
      b?.steamRmRating ?? null, b?.steamRmObservedAt ?? null,
    );
    const dm = selectLatestSteamObservation(
      a?.steamDmRating ?? null, a?.steamDmObservedAt ?? null,
      b?.steamDmRating ?? null, b?.steamDmObservedAt ?? null,
    );
    if (rm.rating === null && dm.rating === null) continue;
    for (const lane of [rm, dm]) {
      if (lane.rating !== null &&
        (!validRating(lane.rating) || !validTime(lane.observedAt)))
        throw Error("STOP: display rating without game clock");
    }
    rows.push({
      identityFingerprint: digest("aoe2war-archived-identity-v1:" + id),
      rmRating: rm.rating, rmObservedAt: rm.observedAt,
      dmRating: dm.rating, dmObservedAt: dm.observedAt,
    });
  }
  rows.sort((a,b)=>a.identityFingerprint.localeCompare(b.identityFingerprint));
  const postProof = await prisma.$queryRawUnsafe(
    "SELECT current_setting('transaction_read_only') AS transaction_mode, " +
    "current_setting('default_transaction_read_only') AS default_mode",
  );
  if (JSON.stringify(postProof) !== JSON.stringify(proof))
    throw Error("STOP: database read-only state changed");
  process.stdout.write(JSON.stringify({
    kind: "aoe2war-qualified-watcher-positive-display-snapshot",
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    productionSource: process.env.AOE2WAR_TRUTH_PRODUCTION_SOURCE ?? null,
    databaseReadOnly: proof,
    sourceCounts: {
      immutableReceiptIdentityRows: receiptRows.length,
      qualifiedDisplayIdentityRows: verifiedDisplayRows.length,
      positiveDisplayIdentities: rows.length,
    },
    sourceCompletenessProven: false,
    labelsAreAllSigned: false,
    absenceIsNotEvidence: true,
    rows,
    mutations: {
      production: 0, parserRows: 0, identityRows: 0,
      currentRatingRows: 0, wolo: 0,
    },
  }));
} finally {
  await prisma.$disconnect();
}
