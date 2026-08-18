CREATE TABLE "page_change_revisions" (
  "href" VARCHAR(80) NOT NULL,
  "source_version" VARCHAR(64) NOT NULL,
  "content_revision" INTEGER NOT NULL DEFAULT 0,
  "reason" VARCHAR(255),
  "changed_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "page_change_revisions_pkey" PRIMARY KEY ("href")
);

CREATE TABLE "user_page_change_seen" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "href" VARCHAR(80) NOT NULL,
  "source_version" VARCHAR(64) NOT NULL,
  "content_revision" INTEGER NOT NULL DEFAULT 0,
  "seen_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_page_change_seen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_user_page_change_seen_user_href"
  ON "user_page_change_seen"("user_id", "href");
CREATE INDEX "ix_user_page_change_seen_href_seen"
  ON "user_page_change_seen"("href", "seen_at");
ALTER TABLE "user_page_change_seen"
  ADD CONSTRAINT "user_page_change_seen_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

INSERT INTO "page_change_revisions"
  ("href", "source_version", "content_revision", "reason", "changed_at")
VALUES
  ('/kingdom', 'src-192988f1d1ef468c60bf', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/oracle', 'src-5a941636c8ddd95aed89', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/leaderboard', 'src-c65679d98ae4ffa461d3', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/champions', 'src-f4f44d05bb6f3a4e4180', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/national-champions', 'src-902f6751950262c6d7df', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/clans', 'src-5d5e28e68bf552686233', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/academy', 'src-a1ca6772804b9f6d30e5', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/market', 'src-ea17e63d40dd10119947', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/ai', 'src-873ba2ffcdfcb844bc93', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/bounties', 'src-b9b14e10edf5e17a9aa1', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/forum', 'src-a1774b3ae767492c332c', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/radio', 'src-aa92d5e6f572d39633b6', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/workshop', 'src-688cd6f9526f2fce19e3', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/game-stats', 'src-d2962c222ebc012ea314', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/traffic', 'src-b321bb617f094b3417d7', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/kingdom-forge', 'src-1f81de96a9d8751a0718', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/round-chamber', 'src-95a089ff68c2d996c2d5', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/statistics', 'src-c2058abd4b0543a475a9', 0, 'Release baseline', CURRENT_TIMESTAMP),
  ('/speed', 'src-b12768780716a2d4af89', 0, 'Release baseline', CURRENT_TIMESTAMP);

-- Existing users begin with current baselines everywhere except Marketplace,
-- which intentionally announces this release. We do not resurrect old browser-local dots.
INSERT INTO "user_page_change_seen"
  ("user_id", "href", "source_version", "content_revision", "seen_at")
SELECT
  u."id",
  baseline."href",
  baseline."source_version",
  baseline."content_revision",
  CURRENT_TIMESTAMP
FROM "users" u
CROSS JOIN (
  VALUES
  ('/kingdom', 'src-192988f1d1ef468c60bf', 0),
  ('/oracle', 'src-5a941636c8ddd95aed89', 0),
  ('/leaderboard', 'src-c65679d98ae4ffa461d3', 0),
  ('/champions', 'src-f4f44d05bb6f3a4e4180', 0),
  ('/national-champions', 'src-902f6751950262c6d7df', 0),
  ('/clans', 'src-5d5e28e68bf552686233', 0),
  ('/academy', 'src-a1ca6772804b9f6d30e5', 0),
  ('/ai', 'src-873ba2ffcdfcb844bc93', 0),
  ('/bounties', 'src-b9b14e10edf5e17a9aa1', 0),
  ('/forum', 'src-a1774b3ae767492c332c', 0),
  ('/radio', 'src-aa92d5e6f572d39633b6', 0),
  ('/workshop', 'src-688cd6f9526f2fce19e3', 0),
  ('/game-stats', 'src-d2962c222ebc012ea314', 0),
  ('/traffic', 'src-b321bb617f094b3417d7', 0),
  ('/kingdom-forge', 'src-1f81de96a9d8751a0718', 0),
  ('/round-chamber', 'src-95a089ff68c2d996c2d5', 0),
  ('/statistics', 'src-c2058abd4b0543a475a9', 0),
  ('/speed', 'src-b12768780716a2d4af89', 0)
) AS baseline("href", "source_version", "content_revision");
