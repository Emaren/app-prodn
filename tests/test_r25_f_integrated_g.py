"""R25 F: independent G before/after and archive-vhost integration contracts."""
import ast
import importlib.util
import pathlib
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
G_SOURCE = ROOT / "scripts/aoe2_r25_f_g_parallel_observer.py"
MAC_SOURCE = ROOT / "scripts/aoe2_r24_f_parallel_nginx_mac.py"
F_SOURCE = ROOT / "scripts/aoe2_r24_f_parallel_nginx_cutover.py"

spec=importlib.util.spec_from_file_location("r25_f_g",G_SOURCE)
g=importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

class TestIntegratedG(unittest.TestCase):
    def nginx(self, before=True):
        port=3030 if before else 3031
        names=[
            "location ^~ /players/by-name/ {",
            "location = /api/kingdom-presence/events {",
            "location ^~ /api/ {",
            "location = / {",
            "location ^~ /download/watcher/ {",
            "location / {",
        ]
        blocks="\n".join(" "+name+"\n  proxy_pass http://127.0.0.1:%d;\n }"%port
                         for name in names)
        return ("server {\n server_name aoe2war.com www.aoe2war.com;\n"
                "listen 443 ssl;\n"+blocks+
                '\nlocation ^~ /rpc/ { proxy_pass http://127.0.0.1:27657/; }\n'
                'location ^~ /rest/ { proxy_pass http://127.0.0.1:1318/; }\n}\n'
                'server { server_name aoe2war.com www.aoe2war.com; listen 80; }\n').encode()
    def witness(self, data):
        output=b"# configuration file /etc/nginx/sites-available/aoe2war.com:\n"+data
        with mock.patch.object(g,"root_file",return_value=data):
            with mock.patch.object(g,"run",return_value=output):
                return g.nginx_route({"nginx_config":"/etc/nginx/sites-available/aoe2war.com"})
    def test_compile_all_three(self):
        for path in (G_SOURCE,MAC_SOURCE,F_SOURCE):
            ast.parse(path.read_text())
    def test_six_old_web_routes(self):
        state=self.witness(self.nginx(True))
        self.assertEqual(state["upstream_port"],3030)
        self.assertEqual(state["website_locations"],6)
    def test_six_new_web_routes(self):
        state=self.witness(self.nginx(False))
        self.assertEqual(state["upstream_port"],3031)
    def test_mixed_routes_fail_closed(self):
        bad=self.nginx(True).replace(b"3030;",b"3031;",1)
        with self.assertRaisesRegex(g.Hold,"G_PARTIAL_SIX_LOCATION_ROUTING_MIXED"):
            self.witness(bad)
    def test_missing_seventh_custody_location_does_not_pass(self):
        bad=self.nginx(True).replace(
            b"proxy_pass http://127.0.0.1:27657/;",
            b"proxy_pass http://127.0.0.1:3030;")
        with self.assertRaisesRegex(g.Hold,"G_PARTIAL_SIX_LOCATION_ROUTING_MIXED"):
            self.witness(bad)
    def test_no_git_in_extracted_candidate(self):
        source=G_SOURCE.read_text()
        self.assertNotIn('git_source(STAGE,"aoe2war-r24-web")',source)
        self.assertIn('"C_ROOT_SEALED_EXACT_GIT_ARCHIVE_NO_DOT_GIT"',source)
        self.assertIn('"C_source_staged_sha256"',source)
        self.assertIn('"C_build_staged_sha256"',source)
    def test_owner_mac_g_before_after_and_auto_rollback(self):
        text=MAC_SOURCE.read_text()
        for expected in ('g_witness(g_path, "before")',
                         'g_witness(g_path, "after", before=before)',
                         '"--root-rollback --nonce " + nonce',
                         "G_REAL_LIVE_PUBLIC_SOURCE_STATIC_FINANCE_WITNESS_NOT_ACCEPTED",
                         "HOLD:G_AFTER_FAILED"):
            self.assertIn(expected,text)
    def test_b_e_stage_positive_guard_relevant(self):
        f=F_SOURCE.read_text()
        for expected in ("verified_b_poststart(j,s)",
                         "verified_durable_e_rollback(j)",
                         "C_EMBEDDED_GIT_ARCHIVE_COMMIT_ID_NOT_PROVEN",
                         "B_SERVER_ENFORCED_SELECT_ONLY_AND_NFT_NOT_PROVEN",
                         "E_R25_REAL_READONLY_RECOVERY_CERTIFICATE_MISSING"):
            self.assertIn(expected,f)

if __name__=="__main__":
    unittest.main()
