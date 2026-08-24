import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock

SCRIPT = (
    pathlib.Path(__file__).resolve().parents[1]
    / "scripts"
    / "aoe2_release_auto.py"
)
SPEC = importlib.util.spec_from_file_location("aoe2_release_auto_migrations", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class MigrationContractTests(unittest.TestCase):
    def with_release(self, migrations, risk="DATABASE"):
        temp = tempfile.TemporaryDirectory()
        root = pathlib.Path(temp.name)
        manifest_dir = root / ".aoe2war-release" / "manifests"
        manifest_dir.mkdir(parents=True)
        release = "a" * 40
        paths = []
        for name, sql in migrations:
            path = root / "prisma" / "migrations" / name / "migration.sql"
            path.parent.mkdir(parents=True)
            path.write_text(sql)
            paths.append(str(path.relative_to(root)))
        (manifest_dir / f"{release}.json").write_text(
            json.dumps(
                {
                    "release_sha": release,
                    "risk_class": risk,
                    "migration_paths": paths,
                }
            )
        )
        return temp, root, manifest_dir, release

    def test_additive_new_table_dml_is_allowed(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    'CREATE TABLE "widget" ("id" SERIAL PRIMARY KEY);',
                ),
                (
                    "20260101000100_update_widget",
                    '''ALTER TABLE "widget" ADD COLUMN "status" TEXT;
UPDATE "widget" SET "status" = 'ready';
DELETE FROM "widget" WHERE FALSE;''',
                ),
            ]
        )
        with temp:
            with mock.patch.object(MODULE, "ROOT", root), mock.patch.object(
                MODULE, "MANIFEST_DIR", manifests
            ):
                manifest, names = MODULE.migration_contract(release)
                self.assertEqual(manifest["risk_class"], "DATABASE")
                self.assertEqual(
                    names,
                    [
                        "20260101000000_create_widget",
                        "20260101000100_update_widget",
                    ],
                )

    def test_destructive_sql_is_rejected(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    '''CREATE TABLE "widget" ("id" SERIAL PRIMARY KEY);
DROP TABLE "widget";''',
                )
            ]
        )
        with temp:
            with mock.patch.object(MODULE, "ROOT", root), mock.patch.object(
                MODULE, "MANIFEST_DIR", manifests
            ):
                with self.assertRaisesRegex(MODULE.AutoShipError, "destructive SQL"):
                    MODULE.migration_contract(release)

    def test_dml_against_preexisting_table_is_rejected(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    '''CREATE TABLE "widget" ("id" SERIAL PRIMARY KEY);
UPDATE "users" SET "email" = "email";''',
                )
            ]
        )
        with temp:
            with mock.patch.object(MODULE, "ROOT", root), mock.patch.object(
                MODULE, "MANIFEST_DIR", manifests
            ):
                with self.assertRaisesRegex(
                    MODULE.AutoShipError,
                    "pre-existing table 'users'",
                ):
                    MODULE.migration_contract(release)

    def test_before_truncate_trigger_is_not_a_destructive_statement(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    """CREATE TABLE "widget" ("id" SERIAL PRIMARY KEY);
CREATE FUNCTION "prevent_widget_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable';
END;
$$;
CREATE TRIGGER "widget_no_truncate"
BEFORE TRUNCATE ON "widget"
FOR EACH STATEMENT
EXECUTE FUNCTION "prevent_widget_mutation"();""",
                )
            ]
        )

        with temp:
            with mock.patch.object(
                MODULE,
                "ROOT",
                root,
            ), mock.patch.object(
                MODULE,
                "MANIFEST_DIR",
                manifests,
            ):
                _, names = MODULE.migration_contract(
                    release
                )
                self.assertEqual(
                    names,
                    ["20260101000000_create_widget"],
                )

    def test_additive_existing_table_pointer_backfill_is_allowed(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_claim",
                    """CREATE TABLE "claim" (
  "id" SERIAL PRIMARY KEY,
  "owner_id" INTEGER NOT NULL
);

ALTER TABLE "users"
ADD COLUMN "current_claim_id" INTEGER;

UPDATE "users" u
SET "current_claim_id" = claim."id"
FROM "claim" claim
WHERE claim."owner_id" = u."id";

ALTER TABLE "users"
ADD CONSTRAINT "uq_users_current_claim"
UNIQUE ("current_claim_id");

ALTER TABLE "users"
ADD CONSTRAINT "users_current_claim_fkey"
FOREIGN KEY ("current_claim_id")
REFERENCES "claim"("id")
ON DELETE SET NULL;""",
                )
            ]
        )

        with temp:
            with mock.patch.object(
                MODULE,
                "ROOT",
                root,
            ), mock.patch.object(
                MODULE,
                "MANIFEST_DIR",
                manifests,
            ):
                manifest, names = (
                    MODULE.migration_contract(
                        release
                    )
                )
                self.assertEqual(
                    manifest["risk_class"],
                    "DATABASE",
                )
                self.assertEqual(
                    names,
                    ["20260101000000_create_claim"],
                )

    def test_aliased_update_of_preexisting_column_is_rejected(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    """CREATE TABLE "widget" (
  "id" SERIAL PRIMARY KEY
);

UPDATE "users" u
SET "email" = u."email"
WHERE u."id" > 0;""",
                )
            ]
        )

        with temp:
            with mock.patch.object(
                MODULE,
                "ROOT",
                root,
            ), mock.patch.object(
                MODULE,
                "MANIFEST_DIR",
                manifests,
            ):
                with self.assertRaisesRegex(
                    MODULE.AutoShipError,
                    "additive backfills may only populate",
                ):
                    MODULE.migration_contract(
                        release
                    )

    def test_delete_from_preexisting_table_is_rejected(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    """CREATE TABLE "widget" (
  "id" SERIAL PRIMARY KEY
);
DELETE FROM "users"
WHERE FALSE;""",
                )
            ]
        )

        with temp:
            with mock.patch.object(
                MODULE,
                "ROOT",
                root,
            ), mock.patch.object(
                MODULE,
                "MANIFEST_DIR",
                manifests,
            ):
                with self.assertRaisesRegex(
                    MODULE.AutoShipError,
                    "forbids deleting pre-existing",
                ):
                    MODULE.migration_contract(
                        release
                    )

    def test_nonadditive_existing_table_alter_is_rejected(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    """CREATE TABLE "widget" (
  "id" SERIAL PRIMARY KEY
);
ALTER TABLE "users"
ALTER COLUMN "email"
SET DEFAULT 'nobody@example.invalid';""",
                )
            ]
        )

        with temp:
            with mock.patch.object(
                MODULE,
                "ROOT",
                root,
            ), mock.patch.object(
                MODULE,
                "MANIFEST_DIR",
                manifests,
            ):
                with self.assertRaisesRegex(
                    MODULE.AutoShipError,
                    "only permits nullable ADD COLUMN",
                ):
                    MODULE.migration_contract(
                        release
                    )

    def test_current_challenge_v3_migrations_fit_additive_contract(self):
        paths = [
            "prisma/migrations/20260823202000_challenge_settlement_allocations_v3/migration.sql",
            "prisma/migrations/20260823224000_challenge_replay_claim_v3/migration.sql",
        ]

        manifest = {
            "release_sha": "d" * 40,
            "risk_class": "DATABASE",
            "migration_paths": paths,
        }

        with mock.patch.object(
            MODULE,
            "release_manifest",
            return_value=manifest,
        ):
            resolved, names = (
                MODULE.migration_contract(
                    "d" * 40
                )
            )

        self.assertEqual(
            resolved["risk_class"],
            "DATABASE",
        )
        self.assertEqual(
            names,
            [
                "20260823202000_challenge_settlement_allocations_v3",
                "20260823224000_challenge_replay_claim_v3",
            ],
        )

    def test_insert_into_preexisting_table_is_rejected(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    """CREATE TABLE "widget" ("id" SERIAL PRIMARY KEY);
INSERT INTO "users" ("email")
VALUES ('x@example.invalid');""",
                )
            ]
        )

        with temp:
            with mock.patch.object(
                MODULE,
                "ROOT",
                root,
            ), mock.patch.object(
                MODULE,
                "MANIFEST_DIR",
                manifests,
            ):
                with self.assertRaisesRegex(
                    MODULE.AutoShipError,
                    "INSERT targets pre-existing table",
                ):
                    MODULE.migration_contract(
                        release
                    )

    def test_cte_update_of_preexisting_column_is_rejected(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    """CREATE TABLE "widget" ("id" SERIAL PRIMARY KEY);
WITH target AS (
  SELECT "id" FROM "users"
)
UPDATE "users" u
SET "email" = u."email"
FROM target
WHERE target."id" = u."id";""",
                )
            ]
        )

        with temp:
            with mock.patch.object(
                MODULE,
                "ROOT",
                root,
            ), mock.patch.object(
                MODULE,
                "MANIFEST_DIR",
                manifests,
            ):
                with self.assertRaisesRegex(
                    MODULE.AutoShipError,
                    "additive backfills may only populate",
                ):
                    MODULE.migration_contract(
                        release
                    )

    def test_merge_is_rejected(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    """CREATE TABLE "widget" ("id" SERIAL PRIMARY KEY);
MERGE INTO "users" u
USING "widget" w
ON u."id" = w."id"
WHEN MATCHED THEN
  UPDATE SET "email" = u."email";""",
                )
            ]
        )

        with temp:
            with mock.patch.object(
                MODULE,
                "ROOT",
                root,
            ), mock.patch.object(
                MODULE,
                "MANIFEST_DIR",
                manifests,
            ):
                with self.assertRaisesRegex(
                    MODULE.AutoShipError,
                    "MERGE is outside",
                ):
                    MODULE.migration_contract(
                        release
                    )

    def test_procedural_update_is_rejected(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    """CREATE TABLE "widget" ("id" SERIAL PRIMARY KEY);
DO $$
BEGIN
  UPDATE "users"
  SET "email" = "email"
  WHERE "id" > 0;
END
$$;""",
                )
            ]
        )

        with temp:
            with mock.patch.object(
                MODULE,
                "ROOT",
                root,
            ), mock.patch.object(
                MODULE,
                "MANIFEST_DIR",
                manifests,
            ):
                with self.assertRaisesRegex(
                    MODULE.AutoShipError,
                    "procedural or dynamic SQL mutation",
                ):
                    MODULE.migration_contract(
                        release
                    )

    def test_dynamic_execute_is_rejected(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    """CREATE TABLE "widget" ("id" SERIAL PRIMARY KEY);
DO $$
BEGIN
  EXECUTE 'DROP TABLE users';
END
$$;""",
                )
            ]
        )

        with temp:
            with mock.patch.object(
                MODULE,
                "ROOT",
                root,
            ), mock.patch.object(
                MODULE,
                "MANIFEST_DIR",
                manifests,
            ):
                with self.assertRaisesRegex(
                    MODULE.AutoShipError,
                    "procedural or dynamic SQL mutation",
                ):
                    MODULE.migration_contract(
                        release
                    )

    def test_old_table_index_on_old_column_is_rejected(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    """CREATE TABLE "widget" ("id" SERIAL PRIMARY KEY);
CREATE INDEX "ix_users_email_probe"
ON "users" ("email");""",
                )
            ]
        )

        with temp:
            with mock.patch.object(
                MODULE,
                "ROOT",
                root,
            ), mock.patch.object(
                MODULE,
                "MANIFEST_DIR",
                manifests,
            ):
                with self.assertRaisesRegex(
                    MODULE.AutoShipError,
                    "CREATE INDEX on pre-existing",
                ):
                    MODULE.migration_contract(
                        release
                    )

    def test_migrations_require_database_or_financial_gate(self):
        temp, root, manifests, release = self.with_release(
            [
                (
                    "20260101000000_create_widget",
                    'CREATE TABLE "widget" ("id" SERIAL PRIMARY KEY);',
                )
            ],
            risk="APPLICATION",
        )
        with temp:
            with mock.patch.object(MODULE, "ROOT", root), mock.patch.object(
                MODULE, "MANIFEST_DIR", manifests
            ):
                with self.assertRaisesRegex(MODULE.AutoShipError, "DATABASE or FINANCIAL"):
                    MODULE.migration_contract(release)

    def test_current_marketplace_release_migrations_fit_additive_contract(self):
        paths = [
            "prisma/migrations/20260818043000_add_marketplace_business_v1/migration.sql",
            "prisma/migrations/20260818071000_marketplace_founding_streets/migration.sql",
            "prisma/migrations/20260818073500_marketplace_fifth_sixth_streets/migration.sql",
            "prisma/migrations/20260818075000_marketplace_owner_approval_control/migration.sql",
            "prisma/migrations/20260818081000_page_change_v2/migration.sql",
            "prisma/migrations/20260818081500_page_change_v2_preserve_chamber_notice/migration.sql",
        ]
        manifest = {
            "release_sha": "b" * 40,
            "risk_class": "DATABASE",
            "migration_paths": paths,
        }
        with mock.patch.object(MODULE, "release_manifest", return_value=manifest):
            resolved, names = MODULE.migration_contract("b" * 40)
        self.assertEqual(resolved["risk_class"], "DATABASE")
        self.assertEqual(len(names), 6)
        self.assertEqual(names[-1], "20260818081500_page_change_v2_preserve_chamber_notice")

    def test_production_migration_script_renders_nested_python(self):
        script = MODULE.production_migration_script(
            release_sha="c" * 40,
            migration_names=["20260101000000_create_widget"],
        )

        self.assertIn('in {chr(34), chr(39)}:', script)
        self.assertIn('values = {\n    "PGHOST":', script)
        self.assertIn('print(f"export {key}={shlex.quote(value)}")', script)

        marker = "<<'PY'\n"
        self.assertIn(marker, script)
        nested_python = script.split(marker, 1)[1].split("\nPY\n", 1)[0]
        compile(nested_python, "<production-db-credential-loader>", "exec")

        shell = subprocess.run(
            ["bash", "-n"],
            input=script,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(shell.returncode, 0, shell.stderr)

    def test_production_migration_receipt_uses_privileged_owned_install(self):
        script = MODULE.production_migration_script(
            release_sha="e" * 40,
            migration_names=["20260101000000_create_widget"],
        )

        self.assertIn(
            'sudo -n /usr/bin/install -d -o tony -g tony -m 0750 "$receipt"',
            script,
        )
        self.assertNotIn('\nmkdir -p "$receipt"\n', script)

    def test_financial_gate_is_also_allowed(self):
        temp, root, manifests, release = self.with_release(
            [("20260101000000_create_widget", 'CREATE TABLE "widget" ("id" SERIAL PRIMARY KEY);')],
            risk="FINANCIAL",
        )
        with temp:
            with mock.patch.object(MODULE, "ROOT", root), mock.patch.object(
                MODULE, "MANIFEST_DIR", manifests
            ):
                manifest, names = MODULE.migration_contract(release)
                self.assertEqual(manifest["risk_class"], "FINANCIAL")
                self.assertEqual(names, ["20260101000000_create_widget"])


if __name__ == "__main__":
    unittest.main()
