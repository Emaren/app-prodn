const baseUrl = (
  process.env.CHALLENGE_RECONCILE_URL || "http://127.0.0.1:3030"
).replace(/\/+$/, "");
const token = (
  process.env.CHALLENGE_RECONCILE_TOKEN ||
  process.env.CRON_SECRET ||
  ""
).trim();
const executeRefunds = !process.argv.includes("--no-refunds");
const takeArg = process.argv.find((arg) => arg.startsWith("--take="));
const take = takeArg ? Number.parseInt(takeArg.slice("--take=".length), 10) : 100;

if (!token) {
  console.error("CHALLENGE_RECONCILE_TOKEN or CRON_SECRET is required.");
  process.exit(1);
}

const response = await fetch(new URL("/api/challenges/reconcile", `${baseUrl}/`), {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    executeRefunds,
    take: Number.isFinite(take) ? Math.max(1, Math.min(take, 500)) : 100,
  }),
});
const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(payload, null, 2));
