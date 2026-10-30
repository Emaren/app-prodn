"""Actual host failure-domain contract tests; source/Intel/third-device are separate."""
from __future__ import annotations
import sys
from pathlib import Path
from unittest import TestCase,main
from unittest.mock import patch
import hashlib,json,subprocess,tempfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
import aoe2_storage_transfer_receipts as r
class PhysicalDomains(TestCase):
    def test_hel1_root_and_volume_are_one_machine_but_different_keys(self):
        with tempfile.TemporaryDirectory() as d:
            folder=Path(d); keys={}
            for host in ("m1","hel1-root","hel1-volume","intel","restore-auditor"):
                priv=folder/(host+".priv"); pub=folder/(host+".pub")
                subprocess.run(["/usr/bin/openssl","genpkey","-algorithm","Ed25519","-out",str(priv)],capture_output=True,check=True)
                subprocess.run(["/usr/bin/openssl","pkey","-in",str(priv),"-pubout","-out",str(pub)],capture_output=True,check=True)
                der=subprocess.run(["/usr/bin/openssl","pkey","-pubin","-in",str(pub),"-outform","DER"],capture_output=True,check=True).stdout
                domain="hel1_host" if host.startswith("hel1-") else "physical_"+host
                keys[host]={"key_id":"key_"+host,"public_key_path":str(pub),"public_spki_sha256":hashlib.sha256(der).hexdigest(),"failure_domain_id":domain}
            def read(p,limit):
                return json.dumps(keys).encode() if p.name=="enrolled.json" else p.read_bytes()
            with patch.object(r,"trusted_bytes",side_effect=read):
                self.assertEqual(r.load_trust(folder/"enrolled.json"),keys)
                keys["hel1-volume"]["failure_domain_id"]="fake_host"
                with self.assertRaisesRegex(r.Hold,"same physical host"):r.load_trust(folder/"enrolled.json")
                keys["hel1-volume"]["failure_domain_id"]="hel1_host"
                keys["intel"]["failure_domain_id"]="hel1_host"
                with self.assertRaisesRegex(r.Hold,"failure domains not separate"):r.load_trust(folder/"enrolled.json")
if __name__=="__main__":main()
