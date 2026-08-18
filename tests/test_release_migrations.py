import importlib.util
import json
import pathlib
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
