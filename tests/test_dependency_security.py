import json
import tempfile
import unittest
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

    def process(self, rows, returncode=0, stderr=""):
        return subprocess_result(
            returncode=returncode,
            stdout="\n".join(json.dumps(row) for row in rows) + "\n",
            stderr=stderr,
        )

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
