"""Five guest routes must not query unauthorized raw nonfinancial-production tables.

A truthful explicit preview is temporary until source-pinned public views exist.
No raw finance, user or gameplay table SELECT permissions are broadened.
"""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
PAGES={
 "ai":("loadPublicAiCouncil(getPrisma())","readModelPending ? []"),
 "kingdom":("loadKingdomSummary()","return <RestrictedPublicPreview"),
 "kingdom-bettors":("loadKingdomBettors()","return <RestrictedPublicPreview"),
 "oracle":("loadOracleSnapshot(getPrisma()","return <RestrictedPublicPreview"),
 "war-engine":("prisma.warEngineCase.findMany(","? []"),
}
class RestrictedGuestPreview(unittest.TestCase):
 def test_all_five_pages_have_explicit_nonfinancial_guard(self):
  for route,(query,guard) in PAGES.items():
   s=(ROOT/"app"/route/"page.tsx").read_text()
   with self.subTest(route=route):
    self.assertIn("usesNonfinancialProductionAuth()",s)
    self.assertIn(query,s)
    self.assertIn(guard,s)
    self.assertIn("data-public-read-model",s if route in ("ai","war-engine") else (ROOT/"components/production/RestrictedPublicPreview.tsx").read_text())
    self.assertTrue(s.index("usesNonfinancialProductionAuth()")<s.index(query))
 def test_no_hidden_financial_permissions_or_fake_success(self):
  s=(ROOT/"components/production/RestrictedPublicPreview.tsx").read_text()
  self.assertIn("Read-only preview",s)
  self.assertIn("temporarily unavailable",s)
  self.assertIn("No wagers, wallets, or settlement operations",s)
  for x in ("force-dynamic","revalidate = 0"):
   self.assertNotIn(x,s)
  for route in ("kingdom-bettors","oracle"):
   page=(ROOT/"app"/route/"page.tsx").read_text()
   self.assertIn("if (usesNonfinancialProductionAuth())",page)
   self.assertTrue(page.index("return <RestrictedPublicPreview")<page.index(PAGES[route][0]))
if __name__=="__main__":unittest.main()
