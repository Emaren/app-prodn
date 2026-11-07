"""A08 no state mutation from authenticated dashboard GET."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
class DashboardNonmutating(unittest.TestCase):
 def test_dashboard_skips_store_initialization(self):
  src=(ROOT/"lib/aoe2Os.ts").read_text()
  fragment=src.split("export async function loadAoe2OsDashboard()",1)[1].split("export ",1)[0]
  self.assertNotIn("await ensureStore()",fragment)
  self.assertIn("listRuns(20, false)",fragment)
  self.assertIn('"EACCES", "EPERM"',src)
  self.assertIn('readJsonObservation<Aoe2OsBridgeHeartbeat>',src)
  self.assertIn('readJsonObservation<Aoe2OsSnapshot>',src)
  self.assertIn('readJsonObservation<Aoe2KingdomIntelligenceSnapshot>',src)
  self.assertIn("if (initialize) await ensureStore();",src)
 def test_api_is_existing_authenticated_get_reader(self):
  src=(ROOT/"app/api/admin/aoe2war-os/route.ts").read_text()
  get=src.split("export async function GET(",1)[1].split("export async function POST(",1)[0]
  self.assertIn("await requireAdmin(request)",get)
  self.assertIn("return dashboardResponse()",get)
  self.assertNotIn("createAoe2OsRun",get)
 def test_storage_visual_denied_receipt_is_unknown(self):
  src=(ROOT/"lib/storageVisualPrivate.ts").read_text()
  self.assertIn('["ENOENT","ENOTDIR","EACCES","EPERM"]',src)
  self.assertIn('return EMPTY_VISUAL;',src)
if __name__=="__main__": unittest.main()
