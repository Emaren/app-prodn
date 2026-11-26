import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from scripts import product_boundary_guard as g

class ExactFactory1434(unittest.TestCase):
    def test_scope_and_literal(self):
        rows=[["M",p] for p in sorted(g.EXACT_WE2_FACTORY1434_CHANGED)]
        g.check_we2_factory1434_rows(rows)
        for bad in (rows[:-1],rows+[["A","scripts/other.py"]],[["D",rows[0][1]],*rows[1:]]):
            with self.assertRaises(g.BoundaryHold): g.check_we2_factory1434_rows(bad)
        self.assertTrue(g.BRANCH.fullmatch(g.EXACT_WE2_FACTORY1434_BRANCH))
        self.assertFalse(g.BRANCH.fullmatch("codex/unrelated"))
        self.assertFalse(g.BRANCH.fullmatch(g.EXACT_WE2_FACTORY1434_BRANCH+"-other"))
    def test_event_and_ancestry(self):
        base=g.EXACT_WE2_FACTORY1434_BASE
        branch=g.EXACT_WE2_FACTORY1434_BRANCH
        sha="a"*40
        repo="Emaren/app-prodn"
        event={"number":1434,"pull_request":{"head":{"repo":{"full_name":repo},"ref":branch,"sha":sha},"base":{"repo":{"full_name":repo},"ref":"main","sha":base}}}
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)/"event.json";p.write_text(json.dumps(event))
            with patch.dict(os.environ,{"GITHUB_EVENT_PATH":str(p),"GITHUB_EVENT_NAME":"pull_request"}), patch.object(g,"git",side_effect=lambda c,*a:a[1]):
                g.check_exact_we2_factory1434_context(Path(tmp),repo,branch,base,sha,ci=True)
                for r,b,s in (("Emaren/kingdom-traders",branch,base),(repo,"main",base),(repo,branch,"b"*40)):
                    with self.assertRaises(g.BoundaryHold):g.check_exact_we2_factory1434_context(Path(tmp),r,b,s,sha,ci=True)
                event["number"]=999;p.write_text(json.dumps(event))
                with self.assertRaises(g.BoundaryHold):g.check_exact_we2_factory1434_context(Path(tmp),repo,branch,base,sha,ci=True)
                event["number"]=1434;event["pull_request"]["head"]["repo"]["full_name"]="fork/app-prodn";p.write_text(json.dumps(event))
                with self.assertRaises(g.BoundaryHold):g.check_exact_we2_factory1434_context(Path(tmp),repo,branch,base,sha,ci=True)
            with patch.object(g,"git",return_value="b"*40):
                with self.assertRaises(g.BoundaryHold):g.check_exact_we2_factory1434_context(Path(tmp),repo,branch,base,sha,ci=False)
    def test_exact_blob_and_custody(self):
        import hashlib
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);p=root/"scripts";p.mkdir();f=p/"aoe2_product_release.py";f.write_bytes(b"fixture");f.chmod(0o644)
            name="scripts/aoe2_product_release.py"
            with patch.dict(g.EXACT_WE2_FACTORY1434_PINS,{name:hashlib.sha256(b"fixture").hexdigest()}):
                g.exact_we2_factory1434_blob(root,name)
                f.write_bytes(b"tamper")
                with self.assertRaises(g.BoundaryHold):g.exact_we2_factory1434_blob(root,name)
                f.write_bytes(b"fixture");f.chmod(0o666)
                with self.assertRaises(g.BoundaryHold):g.exact_we2_factory1434_blob(root,name)
                f.unlink();f.symlink_to("/dev/null")
                with self.assertRaises(g.BoundaryHold):g.exact_we2_factory1434_blob(root,name)
