import hashlib
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "nginx"
GLOBAL = (CONFIG / "aoe2war-profile-pressure-global.conf").read_text()
LOCATION = (CONFIG / "aoe2war-profile-pressure-location.inc").read_text()
ANCHOR = (
    "    location ^~ /players/by-name/ {\n"
    "        if ($request_method !~ ^(GET|HEAD)$) { return 405; }\n"
)


class ProfilePressureContract(unittest.TestCase):
    def test_global_vhost_key_limits(self):
        self.assertEqual(GLOBAL.count("limit_req_zone $server_name"), 1)
        self.assertEqual(GLOBAL.count("limit_conn_zone $server_name"), 1)
        self.assertIn("rate=2r/s;", GLOBAL)
        self.assertIn("zone=aoe2war_player_profile_conn:64k;", GLOBAL)

    def test_location_rate_and_parallel_limit(self):
        self.assertIn("rate burst=3 nodelay;", LOCATION)
        self.assertIn("limit_conn aoe2war_player_profile_conn 2;", LOCATION)
        self.assertIn("limit_req_status 429;", LOCATION)
        self.assertIn("limit_conn_status 429;", LOCATION)

    def test_surgical_https_insertion(self):
        original = (
            "server {\n"
            + ANCHOR
            + "        proxy_pass http://127.0.0.1:3032;\n"
            + "    }\n"
            + "location /api/auth { proxy_pass http://127.0.0.1:3032; }\n"
            + "}\n"
            + "server {\nlocation ^~ /players/by-name/ {\n"
            + "return 301 https://$host$request_uri;\n}\n}\n"
        )
        self.assertEqual(original.count(ANCHOR), 1)
        modified = original.replace(ANCHOR, ANCHOR + "\n" + LOCATION, 1)
        self.assertIn("proxy_pass http://127.0.0.1:3032", modified)
        self.assertEqual(modified.count("limit_conn aoe2war_player_profile_conn"), 1)
        self.assertIn("return 301 https://$host$request_uri;", modified)
        self.assertIn("location /api/auth { proxy_pass", modified)
        self.assertNotEqual(hashlib.sha256(modified.encode()).hexdigest(), hashlib.sha256(original.encode()).hexdigest())

    def test_financial_and_admin_routes_untouched(self):
        for text in [GLOBAL, LOCATION]:
            self.assertNotIn("proxy_pass", text)
            self.assertNotIn("/api/", text)
            self.assertNotIn("8092", text)
            self.assertNotIn("8094", text)
            self.assertNotIn("8095", text)


if __name__ == "__main__":
    unittest.main()
