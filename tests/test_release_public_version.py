import importlib.util
import pathlib
import unittest
from unittest.mock import patch

SCRIPT = (
    pathlib.Path(__file__).resolve().parents[1]
    / "scripts"
    / "aoe2_release.py"
)

SPEC = importlib.util.spec_from_file_location(
    "aoe2_release_public_version_test",
    SCRIPT,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class PublicVersionProbeTests(unittest.TestCase):
    def test_public_version_uses_curl_and_parses_version(self):
        body = '{"buildVersion":"20260815-test"}'

        with patch.object(
            MODULE,
            "run",
            return_value=(0, body, ""),
        ) as mocked:
            self.assertEqual(
                MODULE.public_version(),
                "20260815-test",
            )

        args = mocked.call_args.args[0]

        self.assertEqual(args[0], "curl")
        self.assertIn("-fsS", args)
        self.assertIn("--max-time", args)
        self.assertTrue(
            args[-1].endswith("/api/deployment-version")
        )

    def test_public_version_fails_closed_on_transport_error(self):
        with patch.object(
            MODULE,
            "run",
            return_value=(22, "", "HTTP error"),
        ):
            self.assertIsNone(MODULE.public_version())

    def test_public_version_fails_closed_on_invalid_json(self):
        with patch.object(
            MODULE,
            "run",
            return_value=(0, "not-json", ""),
        ):
            self.assertIsNone(MODULE.public_version())


if __name__ == "__main__":
    unittest.main()
