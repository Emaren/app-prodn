import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { promisify } from "node:util";

import {
  LIVING_KINGDOM_DEPTH_BANDS,
  parseLivingKingdomPostMutation,
} from "../lib/livingKingdom/protocol.ts";
import {
  livingKingdomFeatureAllowsUser,
  livingKingdomFeatureMode,
  resolveLivingKingdomPreferenceMode,
} from "../lib/livingKingdom/identity.ts";
import {
  isLivingKingdomRealmId,
  livingKingdomRealmForPath,
} from "../lib/livingKingdom/realms.ts";

const execFileAsync = promisify(execFile);

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Living Kingdom wire input is coarse and cannot author public identity", () => {
  const mutation = {
    protocol: 1,
    kind: "state",
    tabId: "contract_tab_0001",
    seq: 1,
    realmId: "staking",
    depthBand: LIVING_KINGDOM_DEPTH_BANDS - 1,
    motion: "down",
    visibility: "visible",
  } as const;

  assert.deepEqual(parseLivingKingdomPostMutation(mutation), {
    ok: true,
    value: mutation,
  });

  for (const [field, value] of [
    ["uid", "another-user"],
    ["displayName", "Forged Name"],
    ["avatarUrl", "https://attacker.invalid/avatar.png"],
    ["pathname", "/admin"],
    ["query", "wallet=secret"],
    ["href", "/contact-emaren"],
  ] as const) {
    const result = parseLivingKingdomPostMutation({
      ...mutation,
      [field]: value,
    });
    assert.equal(result.ok, false, `${field} must not enter the wire contract`);
  }
});

test("Living Kingdom realm registry fails closed around private and raw routes", () => {
  assert.equal(livingKingdomRealmForPath("/"), "home");
  assert.equal(livingKingdomRealmForPath("/watch"), "watch");
  assert.equal(livingKingdomRealmForPath("/live-games"), "live-games");
  assert.notEqual(
    livingKingdomRealmForPath("/watch"),
    livingKingdomRealmForPath("/live-games"),
  );
  assert.equal(livingKingdomRealmForPath("/staking?wallet=secret#claim"), "staking");
  assert.equal(livingKingdomRealmForPath("/leaderboard/og"), "page:/leaderboard/og");
  assert.equal(livingKingdomRealmForPath("/clans"), "clans");
  assert.equal(livingKingdomRealmForPath("/clans/jims-clan"), "page:/clans/jims-clan");
  assert.equal(livingKingdomRealmForPath("/clans/aoe2war"), "page:/clans/aoe2war");
  assert.equal(livingKingdomRealmForPath("/bets"), "bets");
  assert.equal(livingKingdomRealmForPath("/bets/123"), "page:/bets/123");
  assert.equal(isLivingKingdomRealmId("page:/bets/123"), true);
  assert.equal(isLivingKingdomRealmId("page:/admin/user-list"), false);
  assert.equal(isLivingKingdomRealmId("page:/unknown/future"), false);

  for (const pathname of [
    "/admin",
    "/admin/user-list?uid=private",
    "/api/user/ping",
    "/auth/callback",
    "/contact-emaren",
    "/profile",
    "/settings/security",
    "/wallet",
    "/game-stats/live/private-session",
    "/game-stats/123/review",
    "/market/invoices/private",
    "/market/%69nvoices/private",
    "/bets/broadcast-previews/private",
    "/bets/%62roadcast-previews/private",
    "/game-stats/%6cive/private-session",
    "/game-stats/123/%72eview",
    "/market/%2e%2e/admin",
    "/market/%zz",
    "/not-in-the-public-registry",
  ]) {
    assert.equal(
      livingKingdomRealmForPath(pathname),
      null,
      `${pathname} must not become public roaming truth`,
    );
  }
});

test("Living Kingdom feature mode fails closed for missing or malformed values", () => {
  for (const raw of [undefined, "", "on", "enabled", "PUBLIC", " public "]) {
    assert.equal(livingKingdomFeatureMode(raw), "off");
  }
  assert.equal(livingKingdomFeatureMode("staff"), "staff");
  assert.equal(livingKingdomFeatureMode("canary"), "canary");
  assert.equal(livingKingdomFeatureMode("public"), "public");

  assert.equal(
    livingKingdomFeatureAllowsUser({
      mode: "off",
      uid: "admin-is-still-off",
      isAdmin: true,
      staffAllowlist: "admin-is-still-off",
      canaryAllowlist: "admin-is-still-off",
    }),
    false,
    "off must remain a server-side hard stop even for an administrator",
  );
});

test("Living Kingdom publication is always-on for eligible avatarized accounts", () => {
  assert.equal(resolveLivingKingdomPreferenceMode(null), "public_coarse");
  assert.equal(resolveLivingKingdomPreferenceMode(undefined), "public_coarse");
  assert.equal(resolveLivingKingdomPreferenceMode({ mode: "public_coarse" }), "public_coarse");
  assert.equal(resolveLivingKingdomPreferenceMode({ mode: "off" }), "public_coarse");
  assert.equal(resolveLivingKingdomPreferenceMode({ mode: "invalid" }), "public_coarse");
});

test("Living Kingdom documentation preserves always-on public-coarse publication", () => {
  const architecture = source("../ARCHITECTURE.md");
  const truthContract = source("../docs/REALTIME_TRUTH_CONTRACT.md");
  const documentation = `${architecture}\n${truthContract}`;

  assert.match(documentation, /always[- ]on/i);
  assert.match(
    architecture,
    /legacy presence-preference rows[\s\S]{0,100}cannot suppress/i,
  );
  assert.match(
    truthContract,
    /Legacy `off`,[\s\S]{0,160}preference rows do not gate it/i,
  );
  assert.match(documentation, /anonymous[\s\S]{0,180}(?:coarse|Unknown Warrior|publish)/i);
  assert.match(documentation, /signed-in[\s\S]{0,120}(?:priority|ahead of anonymous)/i);
  assert.match(documentation, /AI-controlled persona accounts/);
  assert.match(documentation, /no exact scroll offset, cursor\s+position, private-route activity/);
  assert.match(
    documentation,
    /hidden\/minimized tabs renew the last coarse position instead of departing/,
  );
  assert.match(documentation, /does not create new motion or promote[\s\S]{0,80}activity ordering/);
  assert.match(documentation, /Legal and\s+privacy-compliance conclusions are out of scope/);
  assert.doesNotMatch(
    documentation,
    /opted-in warriors|private-by-default|explicit durable `off` preference|opt-out/i,
  );
});

test("movement stays out of Traffic, user ping, activity ledgers, and database writes", () => {
  const stateRoute = source("../app/api/kingdom-presence/state/route.ts");
  const anonymousStateRoute = source("../app/api/kingdom-presence/anonymous-state/route.ts");
  const eventsRoute = source("../app/api/kingdom-presence/events/route.ts");
  const mediaRoute = source("../app/api/media-assets/[kind]/[target]/route.ts");
  const movementSources = [
    stateRoute,
    anonymousStateRoute,
    eventsRoute,
    source("../lib/livingKingdom/protocol.ts"),
    source("../lib/livingKingdom/realms.ts"),
    source("../lib/livingKingdom/rateLimit.ts"),
    source("../lib/livingKingdom/hub.ts"),
    source("../lib/livingKingdom/identity.ts"),
  ].join("\n");

  assert.doesNotMatch(
    movementSources,
    /bridgeUserPresenceToTraffic|TRAFFIC_ANALYTICS_URL|traffic-project|\/api\/user\/ping/i,
  );
  assert.doesNotMatch(
    movementSources,
    /UserActivityEvent|userActivityEvent|recordUserActivity/i,
  );
  assert.doesNotMatch(
    movementSources,
    /prisma\.[A-Za-z0-9_]+\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/,
    "identity eligibility may be read and cached, but movement must never persist",
  );
  assert.match(stateRoute, /livingKingdomHub\.(?:upsert|door|removeTab)/);
  assert.match(stateRoute, /identityGeneration !== livingKingdomIdentityGeneration\(\)/);
  assert.match(stateRoute, /userOnlineSessionIsForcedOffline\(auth\.uid\)/);
  assert.doesNotMatch(stateRoute, /presence_disabled|opt_in_required/);

  assert.match(anonymousStateRoute, /livingKingdomFeatureMode\(\) !== "public"/);
  assert.match(anonymousStateRoute, /isLivingKingdomSameOrigin/);
  assert.match(anonymousStateRoute, /livingKingdomAnonymousIdentity/);
  assert.match(anonymousStateRoute, /livingKingdomHub\.(?:upsert|door|removeTab)/);
  assert.doesNotMatch(anonymousStateRoute, /getSessionUid|getPrisma|prisma\./);

  const logoutFence = stateRoute.indexOf(
    "userOnlineSessionIsForcedOffline(auth.uid)",
  );
  const hubMutation = stateRoute.indexOf("livingKingdomHub.upsert");
  assert.ok(
    logoutFence >= 0 && hubMutation > logoutFence,
    "logout must be re-checked immediately before any hub publication mutation",
  );

  const offGate = stateRoute.indexOf('livingKingdomFeatureMode() === "off"');
  const sessionRead = stateRoute.indexOf("getSessionUid(request)");
  assert.ok(
    offGate >= 0 && sessionRead > offGate,
    "the state route must fail closed before session and identity work",
  );

  const streamOffGate = eventsRoute.indexOf('livingKingdomFeatureMode() === "off"');
  const streamSessionRead = eventsRoute.indexOf("getSessionUid(request)");
  assert.ok(
    streamOffGate >= 0 && streamSessionRead > streamOffGate,
    "the public stream must fail closed before optional viewer identity work",
  );
  assert.match(eventsRoute, /Content-Type": "text\/event-stream; charset=utf-8"/);
  assert.match(eventsRoute, /"X-Accel-Buffering": "no"/);
  assert.match(eventsRoute, /if \(request\.signal\.aborted\) abortStream\(\)/);
  assert.match(eventsRoute, /controller\.error\(error\)/);
  assert.match(mediaRoute, /serveOpaqueLivingKingdomAvatar/);
  assert.match(mediaRoute, /Never redirect these requests/);

  const identitySource = source("../lib/livingKingdom/identity.ts");
  assert.match(identitySource, /registerLivingKingdomAvatar/);
  assert.match(identitySource, /avatarUrl: publicAvatarUrl/);

  const preferenceRoute = source(
    "../app/api/user/presence-preference/route.ts",
  );
  assert.match(preferenceRoute, /isLivingKingdomSameOrigin/);
  assert.match(preferenceRoute, /code: "presence_always_on"/);
  assert.match(preferenceRoute, /status: 405/);
  assert.match(preferenceRoute, /Allow: "GET"/);
  assert.doesNotMatch(
    preferenceRoute,
    /userPresencePreference\.(?:create|update|upsert|delete)|livingKingdomHub\.removeUser|invalidateLivingKingdomIdentity/,
  );
});

test("client and server enforce the bounded publish cadence", () => {
  const client = source("../components/presence/LivingKingdomClient.tsx");
  const limits = source("../lib/livingKingdom/rateLimit.ts");
  const stateRoute = source("../app/api/kingdom-presence/state/route.ts");
  const anonymousStateRoute = source("../app/api/kingdom-presence/anonymous-state/route.ts");

  assert.match(client, /STATE_SEND_INTERVAL_MS\s*=\s*500/);
  assert.match(client, /HEARTBEAT_INTERVAL_MS\s*=\s*8_000/);
  assert.match(client, /sendState\("idle", true, true\)/);
  assert.match(client, /renewOnly/);
  assert.match(client, /bandwidthCalm \? 1_000 : STATE_SEND_INTERVAL_MS/);
  assert.match(client, /const changed = scroll\.band !== lastBand \|\| motion !== lastMotion/);
  assert.match(limits, /ratePerSecond:\s*2,[\s\S]{0,80}burst:\s*4/);
  assert.match(stateRoute, /consume\(`actor:\$\{uid\}`\)/);
  assert.match(anonymousStateRoute, /consume\(\s*`anonymous:\$\{visitorId\}`/);
  assert.doesNotMatch(stateRoute, /actor:\$\{uid\}:\$\{tabId\}/);
});

test("the app shell mounts one client and exposes stable navigation doors", () => {
  const shell = source("../app/AppShell.tsx");
  const mobileNav = source("../components/pwa/MobileFloatingNav.tsx");
  const footer = source("../components/pwa/AoE2WarFooter.tsx");
  const leaderboard = source("../components/leaderboard/LivingLeaderboard.tsx");

  assert.match(shell, /import\("@\/components\/presence\/LivingKingdomClient"\)/);
  assert.equal(
    shell.match(/<LivingKingdomClient\s*\/>/g)?.length,
    1,
    "the document must own exactly one stream/publisher client",
  );
  assert.match(shell, /data-app-shell-header/);
  assert.match(shell, /data-presence-door/);
  assert.match(mobileNav, /data-presence-door=\{livingKingdomRealmForPath\(item\.href\)/);
  assert.match(footer, /data-presence-door=\{livingKingdomRealmForPath\(href\)/);
  assert.match(leaderboard, /data-presence-scroll-root/);
});

test("the example proxy gives the exact SSE endpoint an unbuffered lane", () => {
  const nginx = source("../deploy/nginx.conf.example");
  const start = nginx.indexOf("location = /api/kingdom-presence/events");
  const end = nginx.indexOf("\n    location / {", start);
  assert.ok(start >= 0 && end > start, "exact Living Kingdom location must exist");
  const eventsLocation = nginx.slice(start, end);

  assert.match(eventsLocation, /proxy_http_version 1\.1/);
  assert.match(eventsLocation, /proxy_set_header Connection ""/);
  assert.match(eventsLocation, /proxy_buffering off/);
  assert.match(eventsLocation, /proxy_cache off/);
  assert.match(eventsLocation, /proxy_read_timeout 75s/);
  assert.match(eventsLocation, /X-Accel-Buffering "no" always/);
  assert.doesNotMatch(eventsLocation, /Upgrade/);
});

test("the reusable load harness is loopback-only and uses the real protocol", () => {
  const harness = source("../scripts/living-kingdom-load.mjs");

  assert.match(harness, /LOCAL_HOSTS = new Set\(\["127\.0\.0\.1", "localhost", "::1"\]\)/);
  assert.match(harness, /refusing non-loopback target/);
  assert.match(harness, /\/api\/kingdom-presence\/events/);
  assert.match(harness, /\/api\/kingdom-presence\/state/);
  assert.match(harness, /searchParams\.set\("realm", options\.realm\)/);
  assert.match(harness, /protocol: 1/);
  assert.match(harness, /kind: "state"/);
  assert.match(harness, /method: "DELETE"/);
  assert.match(harness, /minimum: 500/);
  assert.match(harness, /viewers: DEFAULT_PER_IP_STREAM_CAP/);
  assert.match(harness, /DEFAULT_PER_IP_STREAM_CAP = 20/);
  assert.match(harness, /options\.viewers > options\.perIpCap/);
  assert.match(harness, /viewerReconnectsConnected/);
  assert.match(harness, /createTargetProcessSampler/);
  assert.match(harness, /assertTargetOwnsListener/);
  assert.match(harness, /monitorEventLoopDelay/);
  assert.match(harness, /not direct target event-loop instrumentation/);
  assert.match(harness, /redirect: "manual"/);
  assert.match(harness, /cap-plus-one SSE probe/);
  assert.match(harness, /fdRecoveryWaitMs: 6_000/);
  assert.match(harness, /--proof requires/);
  assert.doesNotMatch(harness, /--allow-nonlocal|--force-production/);
});

test(
  "the harness accepts bracketed IPv6 loopback without opening a stream",
  { timeout: 5_000 },
  async () => {
    const scriptPath = new URL("../scripts/living-kingdom-load.mjs", import.meta.url);
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        scriptPath.pathname,
        "--base-url",
        "http://[::1]:9",
        "--viewers",
        "0",
        "--duration-seconds",
        "1",
        "--reconnects",
        "0",
      ],
      {
        cwd: new URL("..", import.meta.url).pathname,
        encoding: "utf8",
        timeout: 4_000,
      },
    );
    const jsonStart = stdout.indexOf("{\n");
    assert.ok(jsonStart >= 0, stdout);
    assert.equal(JSON.parse(stdout.slice(jsonStart)).proof.passed, true);
  },
);

test(
  "the staged loopback proof reconnects every viewer and records process headroom",
  { timeout: 15_000 },
  async () => {
    let activeStreams = 0;
    let peakStreams = 0;
    let streamConnections = 0;
    let publisherPosts = 0;
    let publisherDeletes = 0;
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/kingdom-presence/state") {
        request.resume();
        if (request.method === "POST") publisherPosts += 1;
        if (request.method === "DELETE") publisherDeletes += 1;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end('{"accepted":true,"selfId":"mock"}');
        return;
      }
      if (url.pathname !== "/api/kingdom-presence/events") {
        response.writeHead(404).end();
        return;
      }
      if (!url.searchParams.has("realm")) {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end('{"detail":"Invalid realm"}');
        return;
      }
      if (activeStreams >= 2) {
        response.writeHead(429, {
          "Content-Type": "application/json",
          "Retry-After": "1",
        });
        response.end('{"detail":"stream cap"}');
        return;
      }
      activeStreams += 1;
      peakStreams = Math.max(peakStreams, activeStreams);
      streamConnections += 1;
      let closed = false;
      request.once("close", () => {
        if (closed) return;
        closed = true;
        activeStreams -= 1;
      });
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      const snapshotFrame = `event: snapshot\ndata: ${JSON.stringify({
          protocol: 1,
          realmId: "home",
          actors: [],
          overflowCount: 0,
        })}\n\n`;
      if (url.searchParams.get("realm") === "staking") response.end(snapshotFrame);
      else response.write(snapshotFrame);
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const scriptPath = new URL("../scripts/living-kingdom-load.mjs", import.meta.url);
      await assert.rejects(
        execFileAsync(
          process.execPath,
          [
            scriptPath.pathname,
            "--base-url",
            `http://127.0.0.1:${address.port}`,
            "--viewers",
            "2",
            "--per-ip-cap",
            "2",
            "--duration-seconds",
            "2",
            "--target-pid",
            String(process.ppid),
            "--rss-limit-mib",
            "8192",
            "--fd-limit",
            "4096",
            "--event-loop-limit-ms",
            "1000",
            "--ttfb-limit-ms",
            "2000",
            "--proof",
          ],
          {
            cwd: new URL("..", import.meta.url).pathname,
            encoding: "utf8",
            timeout: 5_000,
          },
        ),
        (error: unknown) => {
          assert.ok(error && typeof error === "object" && "stderr" in error);
          assert.match(
            String((error as { stderr: string }).stderr),
            /does not own the loopback listener/,
          );
          return true;
        },
      );
      const { stdout } = await execFileAsync(
        process.execPath,
        [
          scriptPath.pathname,
          "--base-url",
          `http://127.0.0.1:${address.port}`,
          "--viewers",
          "2",
          "--per-ip-cap",
          "2",
          "--duration-seconds",
          "2",
          "--publishers",
          "1",
          "--reconnects",
          "1",
          "--reconnect-gap-ms",
          "100",
          "--target-pid",
          String(process.pid),
          "--sample-interval-ms",
          "100",
          "--rss-limit-mib",
          "8192",
          "--fd-limit",
          "4096",
          "--event-loop-limit-ms",
          "1000",
          "--ttfb-limit-ms",
          "2000",
          "--fd-recovery-tolerance",
          "32",
          "--fd-recovery-wait-ms",
          "100",
          "--proof",
        ],
        {
          cwd: new URL("..", import.meta.url).pathname,
          encoding: "utf8",
          timeout: 12_000,
          maxBuffer: 2 * 1024 * 1024,
          env: {
            ...process.env,
            AOE2WAR_PRESENCE_TEST_COOKIES: "aoe2hdbets_session=local-test-only",
          },
        },
      );
      const jsonStart = stdout.indexOf("{\n");
      assert.ok(jsonStart >= 0, stdout);
      const summary = JSON.parse(stdout.slice(jsonStart));

      assert.equal(summary.proof.passed, true, JSON.stringify(summary.proof));
      assert.equal(summary.viewers.connected, 4);
      assert.equal(summary.viewers.reconnectsConnected, 2);
      assert.equal(summary.viewers.phases.length, 2);
      assert.equal(summary.viewers.sseFirstByte.samples, 4);
      assert.deepEqual(summary.viewers.capPlusOneStatuses, [429, 429]);
      assert.ok(summary.viewers.bytesReceived > 0);
      assert.ok(summary.headroom.targetProcess.sampleCount >= 2);
      assert.equal(summary.publishers.acceptedPublishers, 1);
      assert.ok(summary.publishers.acceptedRequests >= 1);
      assert.ok(publisherPosts >= 1);
      assert.equal(publisherDeletes, 1);
      assert.equal(streamConnections, 4);
      assert.equal(peakStreams, 2);
      assert.equal(activeStreams, 0);

      await assert.rejects(
        execFileAsync(
          process.execPath,
          [
            scriptPath.pathname,
            "--base-url",
            `http://127.0.0.1:${address.port}`,
            "--viewers",
            "1",
            "--duration-seconds",
            "1",
            "--reconnects",
            "0",
            "--realm",
            "staking",
          ],
          {
            cwd: new URL("..", import.meta.url).pathname,
            encoding: "utf8",
            timeout: 5_000,
            maxBuffer: 2 * 1024 * 1024,
          },
        ),
        (error: unknown) => {
          assert.ok(error && typeof error === "object" && "stdout" in error);
          const failedOutput = String((error as { stdout: string }).stdout);
          const failedJsonStart = failedOutput.indexOf("{\n");
          assert.ok(failedJsonStart >= 0, failedOutput);
          const failedSummary = JSON.parse(failedOutput.slice(failedJsonStart));
          assert.equal(failedSummary.proof.passed, false);
          assert.equal(failedSummary.viewers.unexpectedEnds, 1);
          assert.match(
            failedSummary.proof.failures.join("\n"),
            /ended before their staged cancellation/,
          );
          return true;
        },
      );
    } finally {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
