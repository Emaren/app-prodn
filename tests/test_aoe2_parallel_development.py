#!/usr/bin/env python3
from __future__ import annotations
import importlib.util, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("parallel",ROOT/"scripts/aoe2_parallel.py"); assert spec and spec.loader
m=importlib.util.module_from_spec(spec); sys.modules[spec.name]=m; spec.loader.exec_module(m)
class T(unittest.TestCase):
 def test_contracts(self):
  c=set(m.infer(["lib/liveGames.ts","app/api/bets/route.ts","prisma/schema.prisma","scripts/aoe2_workspace.py"])); self.assertTrue({"battle-identity","watcher-reconciliation","financial-truth","database-schema","release-engineering"}<=c)
 def test_dbfront(self): self.assertTrue(m.dbfront(["prisma/schema.prisma"])); self.assertFalse(m.dbfront(["components/X.tsx"]))
 def test_high_semantic(self):
  a={"changed_paths":[],"contracts":["battle-identity"],"database_frontier":False}; b={"changed_paths":[],"contracts":["battle-identity"],"database_frontier":False}; self.assertEqual(m.severity(a,b)[0],"HIGH")
 def test_dbname(self): self.assertLessEqual(len(m.dbname("feature/"+"very-long-"*20)),63)
if __name__=="__main__": unittest.main()
