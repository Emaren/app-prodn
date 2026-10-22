import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import routes from "../config/kingdom-index-routes.json" with { type: "json" };

const page = readFileSync("app/kingdom-watcher/page.tsx", "utf8");
const ui = readFileSync("app/kingdom-watcher/KingdomWatcherClient.tsx", "utf8");
const server = readFileSync("lib/kingdomWatcherPublic.ts", "utf8");
const api = readFileSync("app/api/kingdom-watcher/route.ts", "utf8");
const shell = readFileSync("app/AppShell.tsx", "utf8");

test("Kingdom Watcher is publicly navigable and independently registered in Kingdom Index", () => {
 assert.match(shell, /\{ href: "\/kingdom-watcher", label: "Kingdom Watcher"/);
 assert.equal(routes.filter(x => x.href === "/kingdom-watcher").length, 1);
 assert.equal(routes.find(x => x.href === "/kingdom-watcher")?.district, "citadel");
 assert.match(page, /KingdomWatcherClient/);
 assert.match(page, /loadKingdomWatcherPublic/);
 assert.match(page, /canonical: "\/kingdom-watcher"/);
});

test("public Watcher source contains no credentials or identified individual clients", () => {
 assert.match(server, /userId: \{ not: null \}/);
 assert.match(server, /sessionId: true/);
 assert.match(server, /new Map<string, Row\[\]>\(\)/);
 assert.match(server, /No account name, stable user ID, token or device fingerprint/);
 assert.doesNotMatch(server, /userDisplayName:|ipAddress: true|userUid: true|watcherId: true|apiKey: true/);
 assert.match(api, /private, no-store, max-age=0/);
 assert.match(api, /X-Content-Type-Options/);
 assert.doesNotMatch(ui, /session\.userId|signal\.sessionId|signal\.userUid|signal\.ipAddress|signal\.watcherId/);
});
test("live status labels cannot be conflated with installs, active matches or device energy", () => {
 assert.match(ui, /Package requests, not confirmed installs/);
 assert.match(ui, /not active matches/);
 assert.match(ui, /not watts/);
 assert.match(ui, /PUBLIC VIEW HIDES IDENTITIES/);
 assert.match(ui, /NOT YET CERTIFIED|NOT YET CERTIFIED/i);
 assert.match(ui, /No synthetic zeros/);
 assert.match(server, /ACTIVE_WINDOW_MS = 150_000/);
 assert.match(server, /EVENT_CAP = 2400/);
 assert.match(server, /STREAM_CAP = 12000/);
});
test("future release comparisons use canonical live version and never forge past performance scores", () => {
 assert.match(server, /current: WATCHER_RELEASE.version/);
 assert.match(server, /previous: WATCHER_RELEASE.previousVersion/);
 assert.match(server, /hardwareBenchmarks: null/);
 assert.match(ui, /NO UNSUPPORTED|No unsupported historical metrics invented/);
 assert.match(ui, /VIEW TEST RECEIPT/);
 assert.doesNotMatch(ui, /score:\s*100|qualityScore:\s*100|watts:\s*0/);
});

test("published binary size comparison is sourced from exact official release artifacts", () => {
 assert.match(server, /official-github-release-assets/);
 assert.match(server, /Emaren\/aoe2-watcher\/releases\/tags\/v/);
 assert.match(server, /data\.draft !== false/);
 assert.match(server, /data\.prerelease !== false/);
 assert.match(server, /Number\.isSafeInteger\(row\.size\)/);
 assert.match(server, /matched\.length === 1/);
 assert.match(server, /deltaPercent:/);
 assert.match(ui, /THE WEIGHT OF THE MACHINE/);
 assert.match(ui, /Exact byte lengths from official published GitHub release assets/);
 assert.match(ui, /not installed RAM, CPU, battery/);
 assert.doesNotMatch(server, /previousBytes: 131087395|currentBytes: 129213289/);
});
