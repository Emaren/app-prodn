import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const statisticsSource = fs.readFileSync(
  new URL("../app/api/statistics/route.ts", import.meta.url),
  "utf8",
);

const watcherSource = fs.readFileSync(
  new URL("../app/admin/watcher-funnel/page.tsx", import.meta.url),
  "utf8",
);

test(
  "Statistics caches its expensive completed-day database query",
  () => {
    assert.match(
      statisticsSource,
      /import \{ unstable_cache \} from "next\/cache"/,
    );

    assert.match(
      statisticsSource,
      /const loadStatisticsRows = unstable_cache\(/,
    );

    assert.match(
      statisticsSource,
      /\["statistics-complete-utc-days-v1"\]/,
    );

    assert.match(
      statisticsSource,
      /\{ revalidate: 3600 \}/,
    );

    assert.match(
      statisticsSource,
      /const rows = await loadStatisticsRows\(\)/,
    );

    // We are caching the expensive data calculation, not
    // silently changing the route's truth/render contract.
    assert.match(
      statisticsSource,
      /export const dynamic = "force-dynamic"/,
    );
  },
);

test(
  "Watcher Funnel reuses its expensive dashboard calculation briefly",
  () => {
    assert.match(
      watcherSource,
      /import \{ unstable_cache \} from "next\/cache"/,
    );

    assert.match(
      watcherSource,
      /const loadCachedWatcherFunnelDashboard = unstable_cache\(/,
    );

    assert.match(
      watcherSource,
      /\["admin-watcher-funnel-dashboard-v1"\]/,
    );

    assert.match(
      watcherSource,
      /\{ revalidate: 15 \}/,
    );

    assert.match(
      watcherSource,
      /loadWatcherFunnelDashboard\(getPrisma\(\)\)/,
    );

    assert.match(
      watcherSource,
      /const data = await loadCachedWatcherFunnelDashboard\(\)/,
    );

    assert.match(
      watcherSource,
      /export const dynamic = "force-dynamic"/,
    );
  },
);
