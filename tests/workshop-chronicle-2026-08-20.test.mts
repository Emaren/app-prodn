import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const publish = fs.readFileSync(
  "scripts/publish-workshop-2026-08-20.mts",
  "utf8",
);
const workshopPage = fs.readFileSync(
  "app/workshop/page.tsx",
  "utf8",
);
const workshopApi = fs.readFileSync(
  "app/api/workshop/route.ts",
  "utf8",
);
const workshopLib = fs.readFileSync(
  "lib/workshop.ts",
  "utf8",
);
const workshopExperience = fs.readFileSync(
  "components/workshop/WorkshopExperience.tsx",
  "utf8",
);
const profilePage = fs.readFileSync(
  "app/profile/page.tsx",
  "utf8",
);
const storage = fs.readFileSync(
  "lib/profileDocuments.ts",
  "utf8",
);

test("Aug 20 Workshop publication is bounded and production-gated", () => {
  assert.match(
    publish,
    /PUBLISH-WORKSHOP-CHRONICLE-2026-08-20/,
  );
  assert.match(
    publish,
    /current_database\(\) AS database_name/,
  );
  assert.match(
    publish,
    /databaseName !== "aoe2hd_db"/,
  );
  assert.match(
    publish,
    /Profiles gain private War Archives/,
  );
  assert.match(
    publish,
    /The operating system closes around the builder/,
  );
});

test("Workshop keeps force-dynamic route but caches its public DB projection", () => {
  assert.match(
    workshopPage,
    /export const dynamic = "force-dynamic"/,
  );
  assert.match(
    workshopPage,
    /loadCachedPublicWorkshop/,
  );
  assert.match(
    workshopPage,
    /loadCachedWorkshopChronicleFirstPage/,
  );
  assert.match(
    workshopLib,
    /unstable_cache/,
  );
  assert.match(
    workshopLib,
    /loadCachedPublicWorkshopSummary/,
  );
  assert.match(
    workshopLib,
    /revalidate: 30/,
  );
  assert.match(
    workshopApi,
    /loadCachedPublicWorkshopSummary/,
  );
  assert.doesNotMatch(
    workshopApi,
    /loadPublicWorkshop\(getPrisma\(\)\)/,
  );
  assert.match(
    workshopExperience,
    /AOE2WAR_WORKSHOP_KINGDOM_BUILDS_AGAIN_20260820/,
  );
});

test("self profile renders primary identity without waiting on secondary rails", () => {
  assert.match(
    profilePage,
    /const secondaryRequests = \[/,
  );
  assert.match(
    profilePage,
    /const profileResponse = await fetch\("\/api\/user\/me"/,
  );
  assert.match(
    profilePage,
    /await Promise\.allSettled\(secondaryRequests\)/,
  );

  const profileAwait =
    profilePage.indexOf(
      'const profileResponse = await fetch("/api/user/me"',
    );
  const secondaryAwait =
    profilePage.indexOf(
      "await Promise.allSettled(secondaryRequests)",
    );

  const secondaryStart =
    profilePage.indexOf(
      "const secondaryRequests = [",
    );

  assert.ok(
    profileAwait >= 0 &&
      secondaryStart > profileAwait &&
      secondaryAwait > secondaryStart,
  );
});

test("War Archive uses private storage with bounded per-user capacity", () => {
  assert.match(
    storage,
    /aoe2war\/profile-documents-private/,
  );
  assert.doesNotMatch(
    storage,
    /MANAGED_MEDIA_UPLOAD_DIR/,
  );
  assert.match(
    storage,
    /MAX_PROFILE_DOCUMENTS_PER_USER = 30/,
  );
  assert.match(
    storage,
    /MAX_PROFILE_DOCUMENT_TOTAL_BYTES = 250 \* 1024 \* 1024/,
  );
});
