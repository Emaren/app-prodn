"""One-use post-HOLD isolation recovery and Steam UID/root DNS drift tests."""
import importlib.util
import json
from pathlib import Path
from unittest import TestCase, mock
import unittest

ROOT=Path(__file__).resolve().parents[1]


def module(filename,name):
 spec=importlib.util.spec_from_file_location(name,ROOT/"scripts"/filename)
 obj=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(obj)
 return obj


s=module("r25_a05_recover_steam_dns_hold.py","r25_a05_recovery")
c=module("r25_c_start_root.py","r25_multidns")


class FakeConnection:
 def __enter__(self):return self
 def __exit__(self,*args):return False
 def version(self):return "TLSv1.3"


class SteamDnsRecoveryTests(TestCase):
 def test_root_and_web_uid_cdn_addresses_union_but_tls_verified(self):
  root_answer=[(None,None,None,None,("23.12.156.233",443))]
  uid_answer=json.dumps(["95.100.176.225"]).encode()
  fake_context=mock.Mock()
  fake_context.wrap_socket.return_value=FakeConnection()
  with mock.patch.object(c.socket,"getaddrinfo",return_value=root_answer) as dns,\
       mock.patch.object(c,"run",return_value=uid_answer) as run,\
       mock.patch.object(c.ssl,"create_default_context",return_value=fake_context),\
       mock.patch.object(c.socket,"create_connection",return_value=FakeConnection()) as connect:
   self.assertEqual(c.production_steam_addresses(),["23.12.156.233","95.100.176.225"])
  self.assertEqual(dns.call_count,2)
  self.assertEqual(run.call_count,2)
  self.assertEqual(connect.call_count,2)
  self.assertTrue(all(call.kwargs.get("server_hostname")=="steamcommunity.com" for call in fake_context.wrap_socket.call_args_list))

 def test_private_uid_dns_response_never_accepted_even_with_successful_tls(self):
  root_answer=[(None,None,None,None,("23.12.156.233",443))]
  with mock.patch.object(c.socket,"getaddrinfo",return_value=root_answer),\
       mock.patch.object(c,"run",return_value=json.dumps(["127.0.0.1"]).encode()),\
       mock.patch.object(c.ssl,"create_default_context"),\
       mock.patch.object(c.socket,"create_connection",return_value=FakeConnection()):
   with self.assertRaises(c.Hold):
    c.production_steam_addresses()

 def test_stopped_rollback_journal_cannot_pass_without_exact_hold_status(self):
  r=mock.Mock()
  r.STAGE_RECEIPT_SHA="a"*64
  prior_plan={"old_source":s.EXPECTED_OLD_SOURCE,"new_source":s.EXPECTED_NEW_SOURCE,
         "old_pid":s.EXPECTED_OLD_PID,"old_ticks":s.EXPECTED_OLD_TICKS,
         "protected_snapshot_sha256":"d"*64,"stage_receipt_sha256":"a"*64,
         "new_unit_sha256":"b"*64}
  entered={"status":"CONSUMED_DO_NOT_REPLAY","financial_authorized":False,
          "public_cutover_authorized":False,"plan":prior_plan}
  held={"financial_authorized":False,"isolated_stop_commands_passed":True,
        "public_cutover_authorized":False,"reason_type":"Hold",
        "status":"CRITICAL_ROLLBACK_INCOMPLETE"}
  def read(path,mode):
   return json.dumps(entered if path.name=="entered.json" else held).encode()
  with mock.patch.object(s,"root_bytes",side_effect=read),\
       mock.patch.object(s.Path,"exists",return_value=False):
   self.assertEqual(s.historical_hold(r)[1]["status"],"CRITICAL_ROLLBACK_INCOMPLETE")
   held["isolated_stop_commands_passed"]=False
   with self.assertRaisesRegex(s.Hold,"PRIOR_HELD_ROLLBACK"):
    s.historical_hold(r)

 def test_exact_nonfinancial_scope_and_no_public_or_finance_mutation_code(self):
  code=(ROOT/"scripts/r25_a05_recover_steam_dns_hold.py").read_text()
  self.assertIn("RECOVER_FAILED_NONFINANCIAL_3032_ONLY",code)
  self.assertIn("STOPPED_NO_PUBLIC_CUTOVER",code)
  self.assertIn("RECOVERY_NONCE_ALREADY_USED",code)
  self.assertIn("EXACT_PLAN_HASH_REQUIRED",code)
  self.assertIn("GITHUB_RECOVERY_SOURCE_NOT_PINNED",code)
  self.assertIn("GITHUB_DNS_CONTROLLER_SOURCE_NOT_PINNED",code)
  self.assertNotIn('candidate_systemd("stop","aoe2hdbets-web.service")',code)
  self.assertNotIn('candidate_systemd("stop","wolo',code)
  self.assertIn('"financial_authorized":False',code)
  self.assertIn('"public_cutover_authorized":False',code)


if __name__=="__main__":unittest.main()
