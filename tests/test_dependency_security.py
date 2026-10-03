import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

import scripts.check_dependency_security as security


class DependencySecurityTests(unittest.TestCase):
    def fixture_root(self) -> tuple[tempfile.TemporaryDirectory, Path]:
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        (root / "package.json").write_text('{"dependencies":{"x":"1.0.0"}}\n')
        (root / "yarn.lock").write_text("# lock\n")
        return temp, root

    def install_module(self, root: Path, module: str, version: str) -> None:
        package_dir = root / "node_modules" / module
        package_dir.mkdir(parents=True, exist_ok=True)
        (package_dir / "package.json").write_text(
            json.dumps({"name": module, "version": version}) + "\n"
        )

    def write_waiver(
        self,
        root: Path,
        *,
        advisory_id: int,
        module: str,
        version: str,
        expires_on: str = "2026-10-16",
        digest: str | None = None,
    ) -> None:
        config = root / "config"
        config.mkdir(parents=True, exist_ok=True)
        payload = {
            "schema": 1,
            "waivers": [
                {
                    "advisory_id": advisory_id,
                    "module": module,
                    "version": version,
                    "scope": "dev-only",
                    "dependency_digest": digest or security.dependency_digest(root),
                    "expires_on": expires_on,
                    "reason": "test waiver",
                    "upstream": "https://example.invalid/advisory",
                }
            ],
        }
        (config / "dependency-security-waivers.json").write_text(
            json.dumps(payload) + "\n"
        )

    def process(self, rows, returncode=0, stderr=""):
        return subprocess_result(
            returncode=returncode,
            stdout="\n".join(json.dumps(row) for row in rows) + "\n",
            stderr=stderr,
        )

    def single_advisory_rows(
        self,
        *,
        root_name: str,
        advisory_id: int = 7,
        module: str = "example",
    ):
        advisory = {
            "id": advisory_id,
            "severity": "high",
            "module_name": module,
            "title": "Example advisory",
            "patched_versions": "<0.0.0",
        }
        return [
            {
                "type": "auditAdvisory",
                "data": {
                    "advisory": advisory,
                    "resolution": {"path": f"{root_name}>{module}"},
                },
            },
            {
                "type": "auditSummary",
                "data": {
                    "vulnerabilities": {
                        "info": 0,
                        "low": 0,
                        "moderate": 0,
                        "high": 1,
                        "critical": 0,
                    },
                    "dependencies": 10,
                },
            },
        ]

    def test_clean_audit_passes_and_binds_dependency_digest(self):
        temp, root = self.fixture_root()
        self.addCleanup(temp.cleanup)
        rows = [
            {
                "type": "auditSummary",
                "data": {
                    "vulnerabilities": {
                        "info": 0,
                        "low": 0,
                        "moderate": 0,
                        "high": 0,
                        "critical": 0,
                    },
                    "dependencies": 42,
                },
            }
        ]
        with mock.patch(
            "scripts.check_dependency_security.subprocess.run",
            return_value=self.process(rows),
        ):
            payload = security.collect(root=root)

        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(payload["dependency_count"], 42)
        self.assertEqual(payload["dependency_digest"], security.dependency_digest(root))
        self.assertEqual(payload["advisories"], [])

    def test_advisory_paths_are_deduplicated_by_advisory_id(self):
        temp, root = self.fixture_root()
        self.addCleanup(temp.cleanup)
        advisory = {
            "id": 7,
            "severity": "high",
            "module_name": "example",
            "title": "Example advisory",
            "patched_versions": ">=2",
        }
        rows = [
            {
                "type": "auditAdvisory",
                "data": {
                    "advisory": advisory,
                    "resolution": {"path": "root>a>example"},
                },
            },
            {
                "type": "auditAdvisory",
                "data": {
                    "advisory": advisory,
                    "resolution": {"path": "root>b>example"},
                },
            },
            {
                "type": "auditSummary",
                "data": {
                    "vulnerabilities": {
                        "info": 0,
                        "low": 0,
                        "moderate": 0,
                        "high": 2,
                        "critical": 0,
                    },
                    "dependencies": 10,
                },
            },
        ]
        with mock.patch(
            "scripts.check_dependency_security.subprocess.run",
            return_value=self.process(rows, returncode=1),
        ):
            payload = security.collect(root=root)

        self.assertEqual(payload["status"], "FAIL")
        self.assertEqual(payload["unique_advisories"]["high"], 1)
        self.assertEqual(payload["path_vulnerabilities"]["high"], 2)
        self.assertEqual(len(payload["advisories"][0]["paths"]), 2)

    def test_exact_dev_only_waiver_preserves_raw_advisory_but_clears_actionable_count(self):
        temp, root = self.fixture_root()
        self.addCleanup(temp.cleanup)
        (root / "package.json").write_text(
            json.dumps({"devDependencies": {"tooling": "1.0.0"}}) + "\n"
        )
        self.install_module(root, "example", "1.0.0")
        self.write_waiver(
            root,
            advisory_id=7,
            module="example",
            version="1.0.0",
        )
        rows = self.single_advisory_rows(root_name="tooling")

        with mock.patch(
            "scripts.check_dependency_security.subprocess.run",
            return_value=self.process(rows, returncode=1),
        ):
            payload = security.collect(
                root=root,
                today=date(2026, 10, 2),
            )

        self.assertEqual(payload["status"], "PASS")
        self.assertEqual(payload["raw_status"], "FAIL")
        self.assertEqual(payload["unique_advisories"]["high"], 1)
        self.assertEqual(payload["actionable_unique_advisories"]["high"], 0)
        self.assertEqual(len(payload["waived_advisories"]), 1)
        self.assertEqual(payload["waived_advisories"][0]["waiver"]["dev_only"], True)
        self.assertEqual(payload["waiver_rejections"], [])

    def test_waiver_refuses_runtime_dependency_path(self):
        temp, root = self.fixture_root()
        self.addCleanup(temp.cleanup)
        (root / "package.json").write_text(
            json.dumps({"dependencies": {"runtime-tool": "1.0.0"}}) + "\n"
        )
        self.install_module(root, "example", "1.0.0")
        self.write_waiver(
            root,
            advisory_id=7,
            module="example",
            version="1.0.0",
        )
        rows = self.single_advisory_rows(root_name="runtime-tool")

        with mock.patch(
            "scripts.check_dependency_security.subprocess.run",
            return_value=self.process(rows, returncode=1),
        ):
            payload = security.collect(
                root=root,
                today=date(2026, 10, 2),
            )

        self.assertEqual(payload["status"], "FAIL")
        self.assertEqual(payload["actionable_unique_advisories"]["high"], 1)
        self.assertEqual(
            payload["waiver_rejections"][0]["reason"],
            "runtime_dependency_path",
        )

    def test_waiver_refuses_expired_exception(self):
        temp, root = self.fixture_root()
        self.addCleanup(temp.cleanup)
        (root / "package.json").write_text(
            json.dumps({"devDependencies": {"tooling": "1.0.0"}}) + "\n"
        )
        self.install_module(root, "example", "1.0.0")
        self.write_waiver(
            root,
            advisory_id=7,
            module="example",
            version="1.0.0",
            expires_on="2026-10-01",
        )
        rows = self.single_advisory_rows(root_name="tooling")

        with mock.patch(
            "scripts.check_dependency_security.subprocess.run",
            return_value=self.process(rows, returncode=1),
        ):
            payload = security.collect(
                root=root,
                today=date(2026, 10, 2),
            )

        self.assertEqual(payload["status"], "FAIL")
        self.assertEqual(payload["waiver_rejections"][0]["reason"], "expired")

    def test_waiver_refuses_version_or_dependency_digest_drift(self):
        temp, root = self.fixture_root()
        self.addCleanup(temp.cleanup)
        (root / "package.json").write_text(
            json.dumps({"devDependencies": {"tooling": "1.0.0"}}) + "\n"
        )
        self.install_module(root, "example", "1.0.1")
        self.write_waiver(
            root,
            advisory_id=7,
            module="example",
            version="1.0.0",
        )
        rows = self.single_advisory_rows(root_name="tooling")

        with mock.patch(
            "scripts.check_dependency_security.subprocess.run",
            return_value=self.process(rows, returncode=1),
        ):
            version_payload = security.collect(
                root=root,
                today=date(2026, 10, 2),
            )
        self.assertEqual(
            version_payload["waiver_rejections"][0]["reason"],
            "installed_version_mismatch",
        )

        self.install_module(root, "example", "1.0.0")
        (root / "yarn.lock").write_text("# dependency drift\n")
        with mock.patch(
            "scripts.check_dependency_security.subprocess.run",
            return_value=self.process(rows, returncode=1),
        ):
            digest_payload = security.collect(
                root=root,
                today=date(2026, 10, 2),
            )
        self.assertEqual(
            digest_payload["waiver_rejections"][0]["reason"],
            "dependency_digest_mismatch",
        )
        self.assertEqual(digest_payload["status"], "FAIL")

    def test_missing_summary_fails_closed(self):
        temp, root = self.fixture_root()
        self.addCleanup(temp.cleanup)
        with mock.patch(
            "scripts.check_dependency_security.subprocess.run",
            return_value=self.process([], returncode=1, stderr="registry unavailable"),
        ):
            with self.assertRaisesRegex(RuntimeError, "no auditSummary"):
                security.collect(root=root)


def subprocess_result(*, returncode, stdout, stderr):
    return type(
        "Result",
        (),
        {
            "returncode": returncode,
            "stdout": stdout,
            "stderr": stderr,
        },
    )()


if __name__ == "__main__":
    unittest.main()
