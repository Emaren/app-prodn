import unittest

import scripts.aoe2_host as host


class HostTests(unittest.TestCase):
    def test_only_release_build_and_deps_instances_are_safe_transients(self):
        self.assertTrue(host.is_safe_transient_unit("aoe2war-build@abc.service"))
        self.assertTrue(host.is_safe_transient_unit("aoe2war-deps@abc.service"))
        self.assertFalse(host.is_safe_transient_unit("aoe2hdbets-web.service"))
        self.assertFalse(host.is_safe_transient_unit("wolochaind-mainnet.service"))

    def test_host_uses_explicit_root_maintenance_authority(self):
        self.assertEqual(host.host_name(), "root@hel1")


if __name__ == "__main__":
    unittest.main()
