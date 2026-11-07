"""Native 3032-only repair guards. Never grants production custody authority."""
import importlib.util
import pathlib
import tempfile
from types import SimpleNamespace
import subprocess
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
PATH=ROOT/"scripts/r25_c_scoped_upgrade_v1.py"
spec=importlib.util.spec_from_file_location("scoped_upgrade",PATH)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Upgrade(unittest.TestCase):
    def test_current_hero_published_not_initial_two_buffer_event(self):
        self.assertEqual(
            m.candidate_event_serialization(
                r'\"type\":\"media_takeover\",\"eventTile\":null,'
                r'\"type\":\"featured_event\",\"eventTile\":{'
                r'\"title\":\"Monday Night Mayhem\",\"ctaUrl\":\"/lobby\"}',
                "Monday Night Mayhem"),
            m.digest("Monday Night Mayhem".encode()))
        for raw in (
            r'\"type\":\"featured_event\",\"eventTile\":{\"title\":\"Wrong\"}',
            r'\"type\":\"media_takeover\",\"eventTile\":{\"title\":\"Monday Night Mayhem\"}',
            r'\"type\":\"featured_event\",\"eventTile\":null,'
            r'\"type\":\"media_takeover\",\"title\":\"Monday Night Mayhem\"'):
            with self.assertRaisesRegex(m.Hold,"CANDIDATE_PUBLISHED_EVENT_NOT_IN_HERO_STREAM"):
                m.candidate_event_serialization(raw,"Monday Night Mayhem")
        with mock.patch.object(m,"native_sql",return_value="BEGIN\n120|2\nROLLBACK"):
            self.assertEqual(m.current_hero_publication(),
                             {"published_hero_version":120,"featured_event_active_index":2})
        with mock.patch.object(m,"native_sql",return_value="BEGIN\nROLLBACK"):
            with self.assertRaisesRegex(m.Hold,"CURRENT_PUBLISHED_HERO_FEATURED_EVENT_NOT_ENABLED"):
                m.current_hero_publication()

    def test_fifth_rollback_and_native_steam_proof_is_strict(self):
        import json,hashlib
        def seal(d):
            return json.dumps(d,sort_keys=True,separators=(",",":"),ensure_ascii=True).encode()
        actual={"controller":"old","guard":"old","unit":"old"}
        entered={"nonce":m.FIFTH_NONCE,"one_use":True,
                 "financial_authorized":False,"public_cutover_authorized":False,
                 "plan":{"new_source_sha":m.SOURCE,"before_policy_bytes":actual}}
        rollback={"status":"PASS_EXACT_STOPPED_3032_PREIMAGE_RESTORED",
                  "reason":"CANDIDATE_PUBLISHED_EVENT_MISSING",
                  "historical_admission_reused":False,"old_3032_running":False,
                  "financial_authorized":False,"public_cutover_authorized":False}
        admitted={"status":"NATIVE_PRODUCTION_ADMISSION_PASS","source_sha":m.SOURCE,
                  "financial_authorized":False,"public_cutover_authorized":False,
                  "steam":{"steam_tls_verification_reachable":True,
                           "unauthenticated_probe_rejected":True,
                           "completed_user_sign_in":False}}
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/("upgrade-"+m.FIFTH_NONCE);path.mkdir()
            a,b,c=seal(entered),seal(rollback),seal(admitted)
            for name,content in (("entered.json",a),("rollback.json",b),
                                 ("runtime-admission.json",c)):
                (path/name).write_bytes(content)
            with mock.patch.object(m,"JOURNALS",pathlib.Path(d)), \
                 mock.patch.object(m,"FIFTH_ENTERED",hashlib.sha256(a).hexdigest()), \
                 mock.patch.object(m,"FIFTH_ROLLBACK",hashlib.sha256(b).hexdigest()), \
                 mock.patch.object(m,"FIFTH_ADMISSION",hashlib.sha256(c).hexdigest()), \
                 mock.patch.object(m,"safe_bytes",side_effect=lambda p:pathlib.Path(p).read_bytes()):
                m.recovered_fifth_content_hold(actual)
                admitted["steam"]["steam_tls_verification_reachable"]=False
                (path/"runtime-admission.json").write_bytes(seal(admitted))
                with self.assertRaisesRegex(m.Hold,"FIFTH_CONSUMED_JOURNAL_DRIFT"):
                    m.recovered_fifth_content_hold(actual)

    def test_new_public_media_root_exactly_required_by_guard(self):
        guard=(ROOT/"scripts/r25_b_guard_production_v1.cjs").read_text()
        self.assertIn('MANAGED_MEDIA_UPLOAD_DIR: "/run/aoe2war-public-media"',guard)
        self.assertIn("UNREVIEWED_ENVIRONMENT_KEY",guard)
        self.assertNotIn('MANAGED_MEDIA_UPLOAD_DIR: "/mnt/',guard)

    def test_rollback_resets_only_genuinely_failed_isolated_unit(self):
        old=SimpleNamespace(PROD_UNIT="aoe2hdbets-web-prod.service")
        new=SimpleNamespace(PROD_UNIT="aoe2hdbets-web-prod.service")
        for state in ("inactive","failed"):
            calls=[]
            def capture(*args,**kwargs):
                calls.append(args)
                return b""
            with mock.patch.object(m,"invoke",side_effect=capture), \
                 mock.patch.object(m,"unit_properties",return_value={
                     "ActiveState":state,"MainPID":"0"}), \
                 mock.patch.object(m,"stopped_candidate",
                                   side_effect=RuntimeError("AFTER_STATE")):
                with self.assertRaisesRegex(RuntimeError,"AFTER_STATE"):
                    m.restore_stopped(old,new,{}, {},False)
            expected=[("/usr/bin/systemctl","stop",m.TIMER,m.REFRESH,new.PROD_UNIT)]
            if state=="failed":
                expected += [("/usr/bin/systemctl","daemon-reload"),
                             ("/usr/bin/systemctl","reset-failed",new.PROD_UNIT)]
            self.assertEqual(calls,expected)

    def test_rollback_rejects_live_isolated_unit_before_mutation(self):
        old=SimpleNamespace(PROD_UNIT="aoe2hdbets-web-prod.service")
        new=SimpleNamespace(PROD_UNIT="aoe2hdbets-web-prod.service")
        with mock.patch.object(m,"invoke",return_value=b"") as executor, \
             mock.patch.object(m,"unit_properties",return_value={
                  "ActiveState":"active","MainPID":"777"}), \
             mock.patch.object(m,"native_sql") as pg:
            with self.assertRaisesRegex(m.Hold,"ROLLBACK_CANDIDATE_PROCESS_STILL_RUNNING"):
                m.restore_stopped(old,new,{}, {},True)
            pg.assert_not_called()
            self.assertEqual(executor.call_count,1)

    def test_third_failed_start_requires_exact_recovered_journal(self):
        import json,hashlib
        def seal(d):
            return json.dumps(d,sort_keys=True,separators=(",",":"),ensure_ascii=True).encode()
        def digest(raw):
            return hashlib.sha256(raw).hexdigest()
        actual={"controller":"old","guard":"old","unit":"old"}
        entered={"nonce":m.THIRD_NONCE,"one_use":True,
                 "financial_authorized":False,"public_cutover_authorized":False,
                 "plan":{"new_source_sha":m.SOURCE,"before_policy_bytes":actual}}
        failed={"status":"CRITICAL_ROLLBACK_INCOMPLETE",
                "reason":"Hold:CANDIDATE_NOT_STOPPED",
                "financial_authorized":False,"public_cutover_authorized":False}
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/("upgrade-"+m.THIRD_NONCE)
            path.mkdir()
            a=seal(entered);b=seal(failed)
            restored={"status":"PASS_EXACT_STOPPED_3032_PREIMAGE_RESTORED_AFTER_FAILED_SYSTEMD_RESET",
                      "nonce":m.THIRD_NONCE,"entered_sha256":digest(a),
                      "original_rollback_hold_sha256":digest(b),
                      "source_controller_sha256":m.THIRD_CONTROLLER_SHA,
                      "preexisting_public_3030_preserved":True,
                      "financial_authorized":False,"public_cutover_authorized":False}
            c=seal(restored)
            for name,raw in (("entered.json",a),("rollback_hold.json",b),
                             ("rollback-recovered.json",c)):
                (path/name).write_bytes(raw)
            with mock.patch.object(m,"JOURNALS",pathlib.Path(d)), \
                 mock.patch.object(m,"THIRD_ENTERED",digest(a)), \
                 mock.patch.object(m,"THIRD_ROLLBACK_HOLD",digest(b)), \
                 mock.patch.object(m,"THIRD_ROLLBACK_RECOVERED",digest(c)), \
                 mock.patch.object(m,"safe_bytes",side_effect=lambda p: pathlib.Path(p).read_bytes()):
                m.recovered_third_failure(actual)
                (path/"rollback-recovered.json").write_bytes(c+b" ")
                with self.assertRaisesRegex(m.Hold,"THIRD_CONSUMED_JOURNAL_DRIFT"):
                    m.recovered_third_failure(actual)

    def test_fourth_consumed_tls_hold_needs_original_recovery_hashes(self):
        import json,hashlib
        def seal(value):
            return json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=True).encode()
        actual={"controller":"old","guard":"old","unit":"old"}
        entered={"nonce":m.FOURTH_NONCE,"one_use":True,
                 "financial_authorized":False,"public_cutover_authorized":False,
                 "plan":{"new_source_sha":m.SOURCE,"before_policy_bytes":actual}}
        failed={"status":"CRITICAL_ROLLBACK_INCOMPLETE",
                "reason":"Hold:NATIVE_COMMAND_FAILED:/usr/bin/systemctl:Failed to reset failed state",
                "financial_authorized":False,"public_cutover_authorized":False}
        with tempfile.TemporaryDirectory() as d:
            path=pathlib.Path(d)/("upgrade-"+m.FOURTH_NONCE)
            path.mkdir()
            a=seal(entered);b=seal(failed)
            recovered={"schema":"aoe2war.a05.stopped-recovery.v1",
                "status":"PASS_EXACT_STOPPED_3032_PREIMAGE_RESTORED_AFTER_TLS_HOLD",
                "nonce":m.FOURTH_NONCE,"entered_sha256":hashlib.sha256(a).hexdigest(),
                "original_rollback_hold_sha256":hashlib.sha256(b).hexdigest(),
                "recovery_source_sha256":m.FOURTH_RECOVERY_SOURCE,
                "original_nonce_consumed":True,
                "old_public_3030_preserved":True,
                "financial_authorized":False,"public_cutover_authorized":False}
            c=seal(recovered)
            for name,data in (("entered.json",a),("rollback_hold.json",b),
                              ("rollback-recovered.json",c)):
                (path/name).write_bytes(data)
            with mock.patch.object(m,"JOURNALS",pathlib.Path(d)), \
                 mock.patch.object(m,"FOURTH_ENTERED",hashlib.sha256(a).hexdigest()), \
                 mock.patch.object(m,"FOURTH_ROLLBACK_HOLD",hashlib.sha256(b).hexdigest()), \
                 mock.patch.object(m,"FOURTH_RECOVERED",hashlib.sha256(c).hexdigest()), \
                 mock.patch.object(m,"safe_bytes",side_effect=lambda p: pathlib.Path(p).read_bytes()):
                m.recovered_fourth_failure(actual)
                (path/"rollback-recovered.json").write_bytes(c+b" ")
                with self.assertRaisesRegex(m.Hold,"FOURTH_CONSUMED_JOURNAL_DRIFT"):
                    m.recovered_fourth_failure(actual)

    def test_pinned_stage_and_financial_scope(self):
        self.assertEqual(m.SOURCE,"175e896c59bf48eda44c15d664d940f5ac40b436")
        self.assertEqual(m.OLD_SOURCE,"886dac221e73167621d6bbfa89cd30edf6b632a3")
        self.assertEqual(m.STAGE.name,"aoe2war-web-prod-"+m.SOURCE[:12])
        self.assertEqual(m.UNIT.name,"aoe2hdbets-web-prod.service")
        self.assertEqual(len(m.TABLES),6)
        self.assertEqual(m.COLUMNS["trophies"],("id","display_name"))
        self.assertFalse(any("wolo" in t or "wager" in t or "claim" in t or "users" in t for t in m.TABLES+tuple(m.COLUMNS.keys())))

    def test_exact_grants_and_revokes_never_mutate_finance(self):
        for enabled in (True,False):
            sql=m.acl_delta(enabled)
            self.assertIn("BEGIN;",sql)
            self.assertIn("COMMIT;",sql)
            self.assertIn("SET LOCAL lock_timeout=",sql)
            self.assertEqual(sql.count(" ON "),4)
            self.assertEqual(sql.count("aoe2war_web_prod;"),4)
            for table in m.TABLES: self.assertIn("public."+table,sql)
            for table,fields in m.COLUMNS.items():
                self.assertIn("(" + ",".join(fields) + ") ON public."+table,sql)
            for forbidden in ("pending_wolo_claims","bet_wagers","users","CREATE ROLE",
                              "ALTER ROLE","DROP ROLE","UPDATE ","INSERT ","DELETE "):
                self.assertNotIn(forbidden,sql)
        self.assertIn("GRANT SELECT",m.acl_delta(True))
        self.assertIn("REVOKE SELECT",m.acl_delta(False))

    def test_visible_parser_excludes_injected_script_content(self):
        source='<html><script>Monday Night Mayhem</script><style>fake</style>' + (
            '<main>Monday Night Mayhem</main><noscript>other</noscript></html>')
        self.assertEqual(m.visible(source)," Monday Night Mayhem ".strip())

    def test_nonce_cannot_be_replayed_or_guessed(self):
        for invalid in ("","ABC","ab"*15,"ab"*17,"_"*32):
            self.assertIsNone(m.re.fullmatch(r"[0-9a-f]{32}",invalid))
        self.assertIsNotNone(m.re.fullmatch(r"[0-9a-f]{32}","a"*32))

    def test_public_content_rejects_missing_event_data_and_empty_traffic(self):
        old = "Original public home stable " * 12
        with mock.patch.object(m,"native_sql",return_value="BEGIN\nMonday Night Mayhem\nROLLBACK"), \
             mock.patch.object(m,"page",return_value=old), \
             mock.patch.object(m,"current_hero_publication",return_value={
                 "published_hero_version":120,"featured_event_active_index":2}):
            with mock.patch.object(m,"candidate_event_transport",
                 side_effect=m.Hold("CANDIDATE_PUBLISHED_EVENT_NOT_IN_HERO_STREAM")):
                with self.assertRaisesRegex(m.Hold,
                                           "CANDIDATE_PUBLISHED_EVENT_NOT_IN_HERO_STREAM"):
                    m.candidate_content()
            with mock.patch.object(m,"candidate_event_transport",return_value="a"*64), \
                 mock.patch.object(m,"page",side_effect=[
                    old,"LAST PUBLISHED UTC DAY: 2026-10-19",
                    "LAST PUBLISHED UTC DAY: 2026-10-19 BROWSER OBSERVED Loading provisional observed activity"]):
                with self.assertRaisesRegex(m.Hold,
                                           "CANDIDATE_CERTIFIED_AND_OBSERVED_TRAFFIC_MISSING"):
                    m.candidate_content()

    def test_authoritative_event_is_in_client_stream_not_initial_visible_slide(self):
        # Live Hero publication v120 features the event at ordinal two, behind
        # the first two server-rendered media takeover buffers.
        from io import BytesIO
        import json
        old="Protected original homepage navigation " * 12
        old_traffic="LAST PUBLISHED UTC DAY: 2026-10-19"
        recent=(old_traffic+" BROWSER OBSERVED Latest observed UTC day 2026-11-03 "+
                "Provisional · unverified Qualifying IPs · not people "+
                "Filtered page GETs · not sessions")
        with mock.patch.object(m,"native_sql",return_value="BEGIN\nMonday Night Mayhem\nROLLBACK"), \
             mock.patch.object(m,"page",side_effect=[old,old_traffic,recent]) as pages, \
             mock.patch.object(m,"current_hero_publication",return_value={
                 "published_hero_version":120,"featured_event_active_index":2}), \
             mock.patch.object(m,"candidate_event_transport",
                               return_value="z"*64) as streamed, \
             mock.patch.object(m.urllib.request,"urlopen",
                 return_value=BytesIO(json.dumps({"buildVersion":"modern-v1"}).encode())), \
             mock.patch.object(m,"candidate_media_witness",return_value={
                 "checked_public_backgrounds":2,"no_private_media_read":True}) as images:
            result=m.candidate_content()
        self.assertEqual(result["candidate_build_version"],"modern-v1")
        self.assertEqual(result["hero_event_stream_sha256"],"z"*64)
        self.assertEqual(result["featured_event_active_index"],2)
        self.assertEqual(result["managed_media"]["checked_public_backgrounds"],2)
        self.assertTrue(result["certified_and_provisional_traffic_visible"])
        self.assertEqual(pages.call_args_list[0].args,(3030,"/"))
        self.assertEqual(len(pages.call_args_list),3)
        streamed.assert_called_once_with("Monday Night Mayhem")
        images.assert_called_once()

    def test_public_media_observation_requires_real_resolved_image_bytes(self):
        from unittest.mock import Mock
        page=b'<html><img src="/uploads/managed-assets/background/hero-a.png"></html>'
        mock_response=Mock(status=200)
        mock_response.read.return_value=page
        connection=Mock()
        connection.getresponse.return_value=mock_response
        valid=(200,"image/png",bytes.fromhex("89504e470d0a1a0a00000000"))
        with mock.patch.object(m.http.client,"HTTPConnection",return_value=connection), \
             mock.patch.object(m,"candidate_media_response",return_value=valid):
            result=m.candidate_media_witness()
        self.assertEqual(result["checked_public_backgrounds"],1)
        self.assertTrue(result["no_private_media_read"])
        with mock.patch.object(m.http.client,"HTTPConnection",return_value=connection), \
             mock.patch.object(m,"candidate_media_response",return_value=(404,"text/plain",b"Not found")):
            with self.assertRaisesRegex(m.Hold,"CANDIDATE_MANAGED_MEDIA_BROKEN"):
                m.candidate_media_witness()
        with self.assertRaisesRegex(m.Hold,"CANDIDATE_MEDIA_UNEXPECTED_PATH"):
            m.candidate_media_response("/uploads/managed-assets/direct-message-attachments/private.jpg")

    def test_unit_change_allows_only_eight_read_only_public_bind_mounts(self):
        # This is a historical, immutable media-only delta. Do not silently
        # reinterpret it using today\'s candidate heap/restart policy.
        import hashlib
        from types import ModuleType
        archived=subprocess.check_output([
            "git","show",
            "bbf5779a343635092a3d2d52d2be2776fe6d6f8e:scripts/r25_c_start_root.py",
        ],cwd=ROOT)
        self.assertEqual(hashlib.sha256(archived).hexdigest(),
                         "9dfa2e68999948c997238196d37737b93e7ca06eb3dbafd1ea29085cc73076f2")
        controller=ModuleType("historical_scoped_media_controller")
        controller.__file__=str(ROOT/"scripts/r25_c_start_root.py")
        exec(compile(archived,controller.__file__,"exec"),controller.__dict__)
        baseline="c60991bf4c9c84509d224f456259a5a46433de42f964c5822cba3ab2952e488c"
        updated=m.approved_media_unit(controller,baseline)
        self.assertEqual(m.digest(updated),
                         "8d5468da652f04de36408ea725b501d5cb7e80a21227eb3cecc96b254fa7b92e")
        self.assertNotIn(b"direct-message-attachments",updated)
        with self.assertRaisesRegex(m.Hold,"EXACT_PUBLIC_READONLY_MEDIA_UNIT_DELTA_REQUIRED"):
            m.approved_media_unit(controller,"0"*64)

    def test_runtime_source_pins_match_committed_controller_and_guard(self):
        for _, (path, size, sha) in m.REVIEWED_RUNTIME_SOURCES.items():
            raw = subprocess.check_output(
                ["git", "show", "ae88696a0bb3085803a2d73833f58eaa2e1e5912:" + path], cwd=ROOT)
            self.assertEqual(len(raw), size)
            self.assertEqual(m.digest(raw), sha)

    def test_traffic_r61_is_only_the_pinned_read_only_audit_forward_commit(self):
        self.assertEqual(m.TRAFFIC_R60_SHA,
                         "4d0e6196f5b4f5653d4062e3494619360ef77de6")
        self.assertEqual(m.TRAFFIC_SHA,
                         "60cf4da5962b4ba65f546d2bea68c3cdc03e8479")
        self.assertEqual(tuple(sorted(m.TRAFFIC_R61_ALLOWED_FILES)),
                         m.TRAFFIC_R61_ALLOWED_FILES)
        self.assertEqual(m.TRAFFIC_R61_ALLOWED_FILES, (
            "docs/PUBLIC_AUDIENCE_V2.md",
            "docs/TRAFFIC_V2_INGESTION_RECEIPTS_OPERATOR.md",
            "scripts/public_audience_v2_ingestion_receipts_health.py",
            "tests/test_public_audience_v2_ingestion_receipts_health.py",
        ))
        def ok_git(*args, **kwargs):
            if args[-2:] == ("rev-parse", "HEAD"): return (m.TRAFFIC_SHA+"\n").encode()
            if args[-3:] == ("status", "--porcelain", "--untracked-files=no"): return b""
            if args[-3:] == ("merge-base", m.TRAFFIC_R60_SHA, m.TRAFFIC_SHA):
                return (m.TRAFFIC_R60_SHA+"\n").encode()
            if len(args)>4 and args[-4:-2] == ("diff","--name-only"):
                return ("\n".join(m.TRAFFIC_R61_ALLOWED_FILES)+"\n").encode()
            raise AssertionError(args)
        with mock.patch.object(m,"safe_bytes",side_effect=lambda path:
                               b"first" if path.name == "before.json" else b"second"), \
             mock.patch.object(m,"invoke",side_effect=ok_git), \
             mock.patch.object(m,"digest",side_effect=lambda data:
                               m.TRAFFIC_RECEIPTS["before.json"] if data==b"first"
                               else m.TRAFFIC_RECEIPTS["commit.json"]):
            m.traffic_receipts()
            def wrong_git(*args,**kwargs):
                result=ok_git(*args,**kwargs)
                if len(args)>4 and args[-4:-2] == ("diff","--name-only"):
                    return result+b"app/main.py\n"
                return result
            with mock.patch.object(m,"invoke",side_effect=wrong_git):
                with self.assertRaisesRegex(m.Hold,"TRAFFIC_R61_SCOPE_NOT_EXACT"):
                    m.traffic_receipts()

    def test_consumed_failed_upgrade_is_never_replayed(self):
        with mock.patch.object(m, "prepare") as prepare:
            with self.assertRaisesRegex(m.Hold, "NONCE_ALREADY_USED"):
                m.upgrade(SimpleNamespace(nonce=m.FAILED_NONCE))
            prepare.assert_not_called()

    def test_altered_failed_receipt_is_rejected_before_any_mutation(self):
        with mock.patch.object(m, "safe_bytes", return_value=b"changed"):
            with self.assertRaisesRegex(m.Hold, "CONSUMED_UPGRADE_JOURNAL_DRIFT"):
                m.prior_failure({})

    def test_stopped_candidate_rejects_an_unowned_listener(self):
        with mock.patch.object(m, "unit_properties", side_effect=[
            {"ActiveState": "inactive", "MainPID": "0"},
            {"ActiveState": "inactive"}, {"ActiveState": "failed"},
        ]), mock.patch.object(m, "invoke", return_value=b"LISTEN 127.0.0.1:3032"):
            with self.assertRaisesRegex(m.Hold, "ISOLATED_3032_LISTENER_STILL_PRESENT"):
                m.stopped_candidate(m.UNIT.name)

    def test_steam_refresh_requires_qualified_successes_beyond_original_ttl(self):
        clock = SimpleNamespace(now=0)
        def sleep(seconds):
            clock.now += seconds
        with mock.patch.object(m.time, "monotonic", side_effect=lambda: clock.now), \
             mock.patch.object(m.time, "sleep", side_effect=sleep), \
             mock.patch.object(m, "refresh_invocation", return_value={"InvocationID": "old"}), \
             mock.patch.object(m, "invoke") as command, \
             mock.patch.object(m, "unit_properties", return_value={"ActiveState": "active"}), \
             mock.patch.object(m, "check_refresh_success", side_effect=lambda _: (
                 (str(clock.now), clock.now != 60) if clock.now % 60 == 0 else None
             )), mock.patch.object(m, "steam_elements", return_value=[{"elem": "present"}]):
            result = m.soak_refresh()
        self.assertGreater(result["elapsed_seconds"], 300)
        self.assertIn("60", result["monitor_holds"])
        self.assertFalse(result["persistent_start_authorized"])
        command.assert_called_once_with("/usr/bin/systemctl", "start", m.TIMER, timeout=45)

    def test_timer_set_expiry_is_a_hold(self):
        with mock.patch.object(m, "refresh_invocation", return_value={"InvocationID": "old"}), \
             mock.patch.object(m, "invoke"), \
             mock.patch.object(m, "unit_properties", return_value={"ActiveState": "active"}), \
             mock.patch.object(m, "check_refresh_success", return_value=None), \
             mock.patch.object(m, "steam_elements", return_value=[]):
            with self.assertRaisesRegex(m.Hold, "STEAM_DESTINATIONS_EXPIRED_DURING_SOAK"):
                m.soak_refresh()

    def test_failed_bootstrap_consumes_nonce_and_restores_stopped_baseline(self):
        with tempfile.TemporaryDirectory() as tmp:
            journals = pathlib.Path(tmp)
            args = SimpleNamespace(nonce="ab" * 16, protected_sha256="p", ci_run=5)
            before = {key: m.digest(b"original") for key in m.FILES}
            plan = {"before_policy_bytes": before, "source_bytes_sha256": before,
                    "public_nginx_sha256": m.digest(b"original")}
            args.plan_hash = m.digest(m.canonical({**plan, "ci_artifact": {"run_id": 5}}))
            old = mock.Mock()
            new = mock.Mock()
            new.production_proxy_bytes.return_value = b"proxy"
            new.production_unit_bytes.return_value = b"unit"
            new.production_runtime_environment.return_value = ({}, "db", "fixture")
            new.production_database_witness.return_value = {"read_acl_sha256": "new"}
            plan["before_read_acl_sha256"] = "old"
            args.plan_hash = m.digest(m.canonical({**plan, "ci_artifact": {"run_id": 5}}))
            journal = journals / ("upgrade-" + args.nonce)
            def fail_bootstrap():
                self.assertTrue((journal / "entered.json").is_file())
                raise m.Hold("failed fixture bootstrap")
            new.production_admission_steam_refresh.side_effect = fail_bootstrap
            with mock.patch.multiple(m, JOURNALS=journals,
                prepare=mock.Mock(return_value=(old, new, {}, plan, {key: b"original" for key in m.FILES})),
                bind_plan=mock.Mock(return_value=plan),
                qualify=mock.Mock(return_value={"comment_id": 42}), assert_protected=mock.Mock(),
                stopped_candidate=mock.Mock(), steam_elements=mock.Mock(return_value=[]),
                safe_bytes=mock.Mock(return_value=b"original"), atomic=mock.Mock(), invoke=mock.Mock(),
                native_sql=mock.Mock(), restore_stopped=mock.Mock()):
                with self.assertRaisesRegex(m.Hold, "failed fixture bootstrap"):
                    m.upgrade(args)
                self.assertNotIn(mock.call("/usr/bin/systemctl", "start", new.PROD_UNIT, timeout=90),
                                 m.invoke.call_args_list)
                m.restore_stopped.assert_called_once()
                self.assertTrue(m.restore_stopped.call_args.args[-1])
                self.assertIn("PASS_EXACT_STOPPED_3032_PREIMAGE_RESTORED",
                              (journal / "rollback.json").read_text())
                with self.assertRaisesRegex(m.Hold, "NONCE_ALREADY_USED"):
                    m.upgrade(args)

if __name__=="__main__":
    unittest.main()
