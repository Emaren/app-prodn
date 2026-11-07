"""A06: admin-only registry cannot enter RSC before server authorization."""
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class DocumentsRscIsolation(unittest.TestCase):
 def test_documents_page_has_own_server_auth_guard(self):
  src=(ROOT/"app/admin/documents-os/page.tsx").read_text()
  self.assertIn('import { requireServerAdmin } from "@/lib/adminSession"',src)
  self.assertIn('export default async function DocumentsOsPage()',src)
  self.assertTrue(src.index("await requireServerAdmin();") < src.index("registry.documents.map"))
  self.assertTrue(src.index("await requireServerAdmin();") < src.index("<main"))
  self.assertIn('export const dynamic="force-dynamic"',src)
 def test_parent_admin_gate_still_applies(self):
  src=(ROOT/"app/admin/layout.tsx").read_text()
  self.assertIn("await requireServerAdmin();",src)
  self.assertIn("return children;",src)
 def test_no_forged_role_or_unconditional_admin_bypass(self):
  src=(ROOT/"app/admin/documents-os/page.tsx").read_text()
  for marker in ("isAdmin: true","fixture-admin","ADMIN_BYPASS","preview-admin","ALLOW_GUEST_SESSIONS"):
   self.assertNotIn(marker,src)
if __name__ == "__main__": unittest.main()
