const baseUrl = (
  process.env.TROPHY_TRIBUTE_QUEUE_URL || "http://127.0.0.1:3030"
).replace(/\/+$/, "");
const token = (
  process.env.TROPHY_TRIBUTE_QUEUE_TOKEN ||
  process.env.STAKING_REWARD_RUN_TOKEN ||
  process.env.CRON_SECRET ||
  ""
).trim();
const date = process.argv.find((arg) => arg.startsWith("--date="))?.slice("--date=".length);

if (!token) {
  console.error("TROPHY_TRIBUTE_QUEUE_TOKEN, STAKING_REWARD_RUN_TOKEN, or CRON_SECRET is required.");
  process.exit(1);
}

const url = new URL("/api/trophies/tributes/queue", `${baseUrl}/`);
if (date) {
  url.searchParams.set("date", date);
}

const response = await fetch(url, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
  },
});
const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(payload, null, 2));
