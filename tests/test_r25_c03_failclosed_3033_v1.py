from __future__ import annotations
import importlib.util
import http.client
import pathlib
import threading
import unittest
from http.server import HTTPServer

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/release/r25_c03_failclosed_3033_v1.py"
UNIT = ROOT / "scripts/release/r25-c03-emergency-3033.service"
s = importlib.util.spec_from_file_location("r25_c03_failclosed_3033_v1", SOURCE)
m = importlib.util.module_from_spec(s)
s.loader.exec_module(m)

class Failclosed3033(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), m.SafeHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
    def call(self, method, path, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=3)
        c.request(method, path, headers=headers or {})
        resp = c.getresponse()
        result = (resp.status, dict(resp.getheaders()), resp.read())
        c.close()
        return result
    def test_health_denies_auth_and_finance(self):
        status, h, body = self.call("GET", "/__c03_internal/healthz")
        self.assertEqual(status, 200)
        self.assertIn(b'"financialExecutionAuthorized":false', body)
        self.assertIn(b'"authContinuityVerified":false', body)
        self.assertIn(b'"eligibleForC03Handoff":false', body)
        self.assertEqual(h["X-AoE2WAR-Fallback"], "failclosed-nonfinancial-only-v1")
    def test_root_safe_nonfinancial_503(self):
        status, h, body = self.call("GET", "/")
        self.assertEqual(status, 503)
        self.assertIn(b"temporarily unavailable", body)
        self.assertNotIn(b"<form", body)
        self.assertIn("no-store", h["Cache-Control"])
        self.assertIn("default-src 'none'", h["Content-Security-Policy"])
    def test_protected_routes_fail_closed_no_token_echo(self):
        for path in ["/admin", "/api/auth/session", "/api/bets", "/api/satchel/v1/returns", "/api/user/me", "/wallet", "/_next/secret", "/kingdom-index?token=do-not-echo"]:
            with self.subTest(path=path):
                status, _, data = self.call("GET", path, headers={"Cookie":"session=do-not-echo"})
                self.assertEqual(status, 503)
                self.assertNotIn(b"do-not-echo", data)
    def test_mutations_all_503_no_proxy(self):
        for method in ["POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE"]:
            with self.subTest(method=method):
                status, _, body = self.call(method, "/api/bets")
                self.assertEqual(status, 503)
                self.assertEqual(body, b"")
    def test_head_correct_without_body(self):
        status, headers, body = self.call("HEAD", "/")
        self.assertEqual(status, 503)
        self.assertEqual(body, b"")
        self.assertEqual(int(headers["Content-Length"]), len(m.PUBLIC_HTML))
    def test_oversized_uri_rejected(self):
        status, _, body = self.call("GET", "/" + "x"*2000)
        self.assertEqual(status, 414)
        self.assertEqual(body, b"")
    def test_nonloopback_rejected(self):
        with self.assertRaisesRegex(ValueError,"MUST_BIND_LOOPBACK_ONLY"):
            m.serve(host="0.0.0.0", port=0)
    def test_unit_resource_and_network_lockdown(self):
        text = UNIT.read_text()
        for required in ["User=aoe2war-c03-emergency", "DynamicUser=yes", "ProtectSystem=strict", "ProtectHome=yes", "NoNewPrivileges=yes", "PrivateDevices=yes", "ConditionFileNotEmpty=/usr/local/lib/aoe2war-web-prod/r25_c03_failclosed_3033_v1.py", "MemoryMax=67108864", "MemorySwapMax=0", "TasksMax=8", "CPUQuota=15%", "IPAddressDeny=any", "IPAddressAllow=localhost", "CapabilityBoundingSet="]:
            self.assertIn(required, text)
        self.assertNotIn("User=aoe2war-web-prod", text)
        self.assertNotIn("aoe2war-c03-failclosed-3033.service", text)
        self.assertTrue(UNIT.name.startswith("r25-"))
        self.assertNotIn("DATABASE_URL", text)
        self.assertNotIn("PORT=8092", text)

if __name__=="__main__": unittest.main()
