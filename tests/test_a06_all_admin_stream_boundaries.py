"""A06 four independently observed anonymous RSC admin stream exposures."""
import unittest
from pathlib import Path
R=Path(__file__).resolve().parents[1]
ROUTES={
 "documents-os":("DocumentsOsPage","registry.documents.map"),
 "kingdom-bettors":("KingdomBettorsAdmin","<main"),
 "marketplace":("AdminMarketplacePage","<main"),
 "parser-lab":("AdminParserLabPage","loadAdminParserLab(getPrisma())"),
}
class AllFourAdminBoundaries(unittest.TestCase):
 def test_page_local_gates_precede_any_data_query_or_jsx(self):
  for route,(name,work) in ROUTES.items():
   with self.subTest(route=route):
    s=(R/f"app/admin/{route}/page.tsx").read_text()
    self.assertIn('import { requireServerAdmin } from "@/lib/adminSession"',s)
    function=f"export default async function {name}()"
    self.assertIn(function,s)
    body=s.split(function,1)[1]
    self.assertIn("await requireServerAdmin();",body)
    self.assertLess(body.index("await requireServerAdmin();"),body.index(work))
    self.assertIn('force-dynamic',s)
    for bypass in ("ADMIN_BYPASS","fixture-admin","isAdmin: true","ALLOW_GUEST_SESSIONS"):
     self.assertNotIn(bypass,s)
 def test_parent_layout_also_enforces_signed_admin(self):
  s=(R/"app/admin/layout.tsx").read_text()
  self.assertIn("await requireServerAdmin();",s)
  self.assertIn("return children;",s)
if __name__=="__main__":unittest.main()
