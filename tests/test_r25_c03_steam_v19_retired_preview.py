"""Exact retired-R24 Steam repair; the original V5Z/C01/C03/C04 remains pinned."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"scripts/release/r25_steam_refresh_traffic_v19.py"
UNIT=ROOT/"scripts/release/r25_steam_refresh_traffic_v19.service"
spec=importlib.util.spec_from_file_location("source_reviewed_r25_v19",SRC)
v=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
PROOF=json.loads((Path.home()/".cache/aoe2war/session-b-c03-v18-roundtrip-isolated-20261109/r24-preview-quiesce-verified.json").read_text())
OLD_SRC=ROOT/"scripts/release/r25_steam_refresh_traffic_v18.py"


class RetiredGuard(unittest.TestCase):
 def test_source_binds_exact_fifteen_independent_proofs(self):
  self.assertEqual(hashlib.sha256(UNIT.read_bytes()).hexdigest(),v.STEAM_V19_UNIT_SHA256)
  self.assertEqual(v.RETIRED_R24_RECEIPT_SHA256,"38cec1654b260a753b36fe185ff0bca2baf177dc2a3d25f86b423321b3aab3e3")
  self.assertEqual(v.FIN_SNAPSHOT,"3a24b53d356d6ac406999fbabed66c5144d74e538503840d407feb4d5f365f15")
  self.assertEqual(v.PRE_C01_FIN_SNAPSHOT,"2dec2527fad7a53730a998898e26bc94b6d2c8c930db80aa7de1b44578a20f42")
  self.assertEqual(v.OLD_C01_POST_SHA256,"6bef38a7bbd89f4041e832eeebfa7c2213fa627633299b8d0ad45135b3018999")
  self.assertEqual(v.OLD_C01_PRE_SHA256,"064a16dde48c64a3001621902b4ae7a028ec4975183fd4c24b8a16338c1a226c")
  self.assertEqual(v.NFT_SHAPE,"985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af")
  for source in ("r25_steam_c01_delta_guard_v1.py","r25_c03_observer_oneshot_guard_v9.py",
                 "r25_c04_masked_listener_guard_v11.py","r25_steam_refresh_public_recovery_v5z.py"):
   self.assertIn(source,SRC.read_text())
  self.assertIn("ProtectHome=yes",UNIT.read_text())
  self.assertIn("ProtectSystem=strict",UNIT.read_text())
  self.assertNotIn("systemctl unmask",SRC.read_text())
  self.assertNotIn("http://127.0.0.1:8092",SRC.read_text())

 def conditions(self,proof=None,unit=None,enabled="disabled",nginx="no-port-3031",sockets="LISTEN ...127.0.0.1:3032 "):
  class Model:
   @staticmethod
   def unit_state(name):
    return unit if unit is not None else {
      "properties":{"Id":"aoe2hdbets-web-r24.service","Type":"simple",
                    "ActiveState":"inactive","MainPID":"0","NeedDaemonReload":"no"},
      "start_ticks":None,"unit_config_sha256":v.RETIRED_R24_CONFIG_SHA256}
  def exec_output(cmd,timeout=8):
   if cmd[0]=="systemctl":
    if cmd[1]=="show" and "MainPID" in cmd:return "0"
    if cmd[1]=="show" and "ActiveState" in cmd:return "inactive"
    if cmd[1]=="list-dependencies":return "aoe2hdbets-web-r24.service"
   if "nginx" in cmd[0]:return nginx
   if "ss" in cmd[0]:return sockets
   raise AssertionError("UNREVIEWED_COMMAND")
  cp=subprocess.CompletedProcess(["systemctl"],0 if enabled=="enabled" else 1,stdout=enabled,stderr="")
  from contextlib import ExitStack
  stack=ExitStack()
  stack.enter_context(patch.object(v,"verified",return_value=json.dumps(proof if proof is not None else PROOF).encode()))
  stack.enter_context(patch.object(v,"exec_out",side_effect=exec_output))
  stack.enter_context(patch.object(v.subprocess,"run",return_value=cp))
  return stack,Model()

 def test_genuine_retirement_authored_exception_positive(self):
  stack,m=self.conditions()
  with stack:
   accepted=v.verify_exact_retired_preview(m)
  self.assertEqual(accepted["properties"]["MainPID"],"0")
  self.assertEqual(accepted["properties"]["ActiveState"],"inactive")

 def test_source_and_quiescence_failure_never_admitted(self):
  mutations=[
   ("status","PASS_FAKE"),
   ("r24_after_active","active"),
   ("service_enabled","enabled"),
   ("financial_permissions_modified",True),
   ("money_moved",True),
   ("C03_APP_HANDOFF_ACCEPTED",True),
   ("nginx_3031_selectors_before",1),
   ("active_3031_connections_before",1),
  ]
  for field,value in mutations:
   with self.subTest(field=field):
    proof=dict(PROOF,**{field:value})
    stack,m=self.conditions(proof=proof)
    with stack,self.assertRaises(RuntimeError):
     v.verify_exact_retired_preview(m)
  for field,value in (("r24_pid","1111"),("prod_pid","1111"),
                      ("steam_sha","0"*64),("web_sha","a"*64)):
   proof=dict(PROOF,before={**PROOF["before"],field:value})
   stack,m=self.conditions(proof=proof)
   with stack,self.assertRaises(RuntimeError):
    v.verify_exact_retired_preview(m)

 def test_live_resurrection_or_new_route_denied(self):
  for kwargs in ({"enabled":"enabled"},{"nginx":"proxy_pass http://127.0.0.1:3031"},
                 {"sockets":"LISTEN ...127.0.0.1:3031 "},
                 {"unit":{"properties":{"Id":"aoe2hdbets-web-r24.service",
                                         "Type":"simple","MainPID":"1234",
                                         "ActiveState":"active","NeedDaemonReload":"no"},
                          "start_ticks":1,"unit_config_sha256":v.RETIRED_R24_CONFIG_SHA256}}):
   stack,m=self.conditions(**kwargs)
   with stack,self.assertRaises(RuntimeError):
    v.verify_exact_retired_preview(m)

 def test_root_source_monkeypatch_only_exact_obsolete_pid(self):
  source=SRC.read_text()
  original=OLD_SRC.read_text()
  self.assertIn("if reason=='PRESERVED_PREVIEW_PID_DRIFT' and not ok:",source)
  self.assertIn("return original_need(ok,reason)",source)
  self.assertIn("delta.POST_C01_SHA=FIN_SNAPSHOT",source)
  self.assertIn("delta.PRE_C01_SHA=PRE_C01_FIN_SNAPSHOT",source)
  self.assertIn("C01_ORIGINAL_PREVIEW_FINGERPRINTS_CHANGED",source)
  self.assertIn("R24_QUIESCENCE_RECEIPT_ROOT_SHA_DRIFT",source)
  self.assertIn("C04_EXACT_MASK_HELPER_SOURCE_DRIFT",source)
  self.assertIn("STEAM_NFT_SHAPE_DRIFT",source)
  self.assertIn("PROTECTED_FINANCE_TOPOLOGY_DRIFT",source)
  self.assertEqual(original.count("PRESERVED_PREVIEW_PID_DRIFT"),0)

if __name__=="__main__":
 unittest.main()
