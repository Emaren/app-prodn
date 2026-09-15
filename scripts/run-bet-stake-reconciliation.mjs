const baseUrl = (
  process.env.BET_STAKE_RECONCILE_URL || "http://127.0.0.1:3030"
).replace(/\/+$/, "");
const token = (
  process.env.BET_STAKE_RECONCILE_TOKEN ||
  process.env.CRON_SECRET ||
  ""
).trim();
const rawTake = Number.parseInt(process.env.BET_STAKE_RECONCILE_TAKE || "20", 10);
const take = Number.isFinite(rawTake) ? Math.max(1, Math.min(rawTake, 50)) : 20;
const args = new Set(process.argv.slice(2));
const unknownArgs = [...args].filter((value) => value !== "--apply");

if (unknownArgs.length > 0) {
  console.error(`Unknown argument(s): ${unknownArgs.join(", ")}`);
  process.exit(2);
}
if (!token) {
  console.error("BET_STAKE_RECONCILE_TOKEN or CRON_SECRET is required.");
  process.exit(1);
}

const apply = args.has("--apply");
const url = new URL("/api/bets/stake-reconciliation", `${baseUrl}/`);
if (!apply) url.searchParams.set("take", String(take));

const response = await fetch(url, {
  method: apply ? "POST" : "GET",
  headers: {
    authorization: `Bearer ${token}`,
    ...(apply ? { "content-type": "application/json" } : {}),
  },
  ...(apply ? { body: JSON.stringify({ take }) } : {}),
  signal: AbortSignal.timeout(220_000),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(payload, null, 2));
