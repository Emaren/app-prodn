"""Source-only R25 transport SHA and absolute financial-owner quarantine."""
import hashlib
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"lib/warSatchelNativeOnlyReturn.ts"
WIRE=ROOT/"tests/war-satchel-native-go-http-wire.test.mts"

class SourceParity(unittest.TestCase):
 def test_byte_exact_c02_upstream_transport_sha(self):
  # Exact source from App #1268 / c0613c9aa, not a rewritten runtime.
  self.assertEqual(hashlib.sha256(SRC.read_bytes()).hexdigest(), "3998247e3cec10b17967381b0cae2f8634a796ce482235b0966e7e957293e020")
 def test_one_native_only_route_family_and_no_legacy(self):
  s=SRC.read_text()
  self.assertIn("http://127.0.0.1:8094/satchel/v1/returns",s)
  for fragment in ("127.0.0.1:8092","127.0.0.1:8093",
                   "/settlement/v1/runs","privateKey","mnemonic","broadcastTx","retryPost"):
   self.assertNotIn(fragment,s)
  self.assertIn("return recoverFreshNativeReturn",s)
  self.assertIn("journal.insertOnce(identity)",s)
  self.assertIn('creditAuthorized: false',s)
 def test_source_is_inert_and_no_owner_worker_was_migrated(self):
  for name in ("warSatchelNativeReturnJournal.ts",
               "warSatchelNativeReturnRuntime.ts",
               "hdFinancialMaintenanceFence.ts"):
   self.assertFalse((ROOT/"lib"/name).exists(),name)
  self.assertNotIn("C02_INERT_GO_HTTP_WIRE_TEST",SRC.read_text())
  self.assertIn('skip:process.env.C02_INERT_GO_HTTP_WIRE_TEST!=="true"',WIRE.read_text())
  self.assertIn('C02 HOLD: funded journal Prisma/migration parity not present',
                (ROOT/"tests/war-satchel-native-8094-forward-only.test.mts").read_text())

if __name__=="__main__":unittest.main()
