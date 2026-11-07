"""Non-authoritative site content observer: false-green and privacy regression."""
import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, mock
import unittest

SOURCE = Path(__file__).resolve().parents[1]/"scripts/aoe2war_release_readiness_observer.py"
spec=importlib.util.spec_from_file_location("readiness_observer",SOURCE)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
HTML_PREFIX = '<html><body><main class="content">'


def page(marker, error="", minsize=36_000):
    raw = (HTML_PREFIX + marker + error + '</main></body></html>').encode()
    return raw + b" " * max(0, minsize - len(raw))


class TestObserver(TestCase):
    def test_exact_eight_routes_and_no_user_auth(self):
        self.assertEqual(list(m.ROUTES), [
            "/players", "/war-chest", "/game-stats", "/rivalries",
            "/battle-archive", "/bounties", "/champions", "/radio"])
        self.assertEqual(m.PORTS, {"public":3030,"isolated":3032})
        source=SOURCE.read_text()
        self.assertIn('"GET"',source)
        self.assertNotIn("Authorization:",source)
        self.assertNotIn("Cookie:",source)
        self.assertNotIn("urllib.request.urlopen(request, data=",source)

    def test_http_200_with_streamed_next_error_is_hold(self):
        for flight in ('7:E{"digest":"2743377646"}',
                       'a:E\\{"digest":"3720221088"}',
                       '8:E{\\\"digest\\\":\\\"1045849253\\\"}'):
            with self.subTest(flight=flight), mock.patch.object(
                    m,"http_read",return_value=(200,page("Player Registry",flight),False)):
                result=m.probe_route(3032,"/players","Player Registry")
                self.assertEqual(result["status"],"HOLD_RSC_ERROR")
                self.assertGreater(result["rsc_error_records"],0)

    def test_no_fabricated_success_on_shell_or_truncation(self):
        for body, truncated, expected in (
            (page("Other Headline"),False,"HOLD_CONTENT_INCOMPLETE"),
            (b"<html>Player Registry</html>",False,"HOLD_CONTENT_INCOMPLETE"),
            (page("Player Registry"),True,"HOLD_TRUNCATED"),
        ):
            with self.subTest(expected=expected), mock.patch.object(
                m,"http_read",return_value=(200,body,truncated)):
                self.assertEqual(m.probe_route(3032,"/players","Player Registry")["status"], expected)

    def test_matching_real_page_is_diagnostic_only(self):
        with mock.patch.object(m,"http_read",return_value=(200,page("WAR CHEST"),False)):
            self.assertEqual(m.probe_route(3030,"/war-chest","WAR CHEST")["status"],
                             "PASS_GUEST_HTML_AND_FLIGHT_DIAGNOSTIC_ONLY")

    def test_stopped_isolated_cannot_be_reported_as_pass(self):
        from urllib.error import URLError
        with mock.patch.object(m,"probe_version",side_effect=[
            {"status":"PASS_VERSION","buildVersion":"20261028134227-6c0f6d7531"},
            {"status":"HOLD_REACHABILITY","error_class":"URLError"},
        ]), mock.patch.object(m,"probe_route",return_value={"status":"PASS_GUEST_HTML_AND_FLIGHT_DIAGNOSTIC_ONLY"}):
            report=m.observe()
            self.assertEqual(report["surfaces"]["isolated"]["status"],"STOPPED_OR_UNREACHABLE")
            self.assertEqual(report["surfaces"]["public"]["status"],"GUEST_PROBES_PASS")
            self.assertFalse(report["public_cutover_authorized"])
            self.assertFalse(report["financial_authorized"])
            self.assertFalse(report["steam_authenticated"])
            self.assertFalse(report["admin_verified"])
            self.assertFalse(report["source_full_site_acceptance"])

    def test_output_is_bounded_metadata_without_html(self):
        with TemporaryDirectory() as root:
            path=Path(root)/"out"/"latest.json"
            report={"schema":m.STATE_SCHEMA,"status":"PUBLIC_DIAGNOSTIC_HOLD",
                    "surfaces":{"isolated":{"routes":{}}, "public":{"routes":{}}}}
            digest=m.persist(report,path)
            assert len(digest)==64
            self.assertEqual(json.loads(path.read_text()),report)
            self.assertEqual(path.stat().st_mode & 0o777,0o600)
            self.assertFalse(any(p.name.endswith(".tmp") for p in path.parent.iterdir()))
            with self.assertRaises(ValueError):
                m.persist({"unbounded":"Z"*40_000},path)


if __name__=="__main__":unittest.main()

class SystemdReadinessBoundary(TestCase):
    def test_bounded_oneshot_reuses_systemd_with_no_authority(self):
        root=SOURCE.parents[1]
        service=(root/"deploy/systemd/aoe2war-release-readiness-observer.service").read_text()
        timer=(root/"deploy/systemd/aoe2war-release-readiness-observer.timer").read_text()
        for text in ("Type=oneshot", "DynamicUser=yes", "StateDirectory=",
                     "NoNewPrivileges=yes", "ProtectSystem=strict", "IPAddressDeny=any",
                     "IPAddressAllow=localhost", "TimeoutStartSec=100s",
                     "MemoryMax=96M", "CPUQuota=25%"):
            self.assertIn(text,service)
        self.assertIn("OnUnitInactiveSec=5min",timer)
        self.assertIn("Persistent=false",timer)
        self.assertNotIn("ExecStartPre=/bin/bash",service)
        self.assertNotIn("EnvironmentFile=",service)
        self.assertNotIn("Restart=always",service)
        self.assertNotIn("WorkingDirectory=/var/www/",service)
