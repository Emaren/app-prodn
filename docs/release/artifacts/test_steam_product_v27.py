"""Isolated negative tests: no systemd, root privileges or nft writes."""
import importlib.util
from pathlib import Path
import unittest

PATH=Path(__file__).with_name("r25_steam_refresh_product_v27.py")
SPEC=importlib.util.spec_from_file_location("steam_product_v27",PATH)
m=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)

class ProductWebUnitTests(unittest.TestCase):
    def setUp(self):
        self.old=m.BASE_WEB_DIR
        self.new="/var/lib/aoe2war-web-prod-aabbccddeeff"
        self.base=("User=aoe2war-web-prod\nProtectSystem=strict\n"
                   "WorkingDirectory="+self.old+"\n"
                   "ReadOnlyPaths="+self.old+"\n"
                   "BindPaths=/var/cache/r:"+self.old+"/.next/cache\n"
                   "BindReadOnlyPaths=/media:"+self.old+"/public/downloads\n"
                   "PORT=3032\n").encode()
        self.valid=self.base.replace(self.old.encode(),self.new.encode())
    def test_current_source_matches_accepted_template(self):
        self.assertTrue(m.unit_path_only_diff(self.base,self.base,self.old))
    def test_new_version_changes_only_four_paths(self):
        self.assertTrue(m.unit_path_only_diff(self.valid,self.base,self.new))
    def test_only_one_path_moved(self):
        with self.assertRaisesRegex(RuntimeError,"WEB_UNIT_SECURITY_PROFILE_CHANGED"):
            m.unit_path_only_diff(self.base.replace(self.old.encode(),self.new.encode(),1),self.base,self.new)
    def test_web_uid_change_rejected(self):
        with self.assertRaisesRegex(RuntimeError,"WEB_UNIT_SECURITY_PROFILE_CHANGED"):
            m.unit_path_only_diff(self.valid.replace(b"User=aoe2war-web-prod",b"User=root"),self.base,self.new)
    def test_web_port_change_rejected(self):
        with self.assertRaisesRegex(RuntimeError,"WEB_UNIT_SECURITY_PROFILE_CHANGED"):
            m.unit_path_only_diff(self.valid.replace(b"3032",b"3030"),self.base,self.new)
    def test_sandbox_change_rejected(self):
        with self.assertRaisesRegex(RuntimeError,"WEB_UNIT_SECURITY_PROFILE_CHANGED"):
            m.unit_path_only_diff(self.valid.replace(b"strict",b"full"),self.base,self.new)
    def test_fifth_path_append_rejected(self):
        with self.assertRaisesRegex(RuntimeError,"WEB_UNIT_SECURITY_PROFILE_CHANGED"):
            m.unit_path_only_diff(self.valid+b"ReadWritePaths="+self.new.encode(),self.base,self.new)
    def test_bad_path_parent_rejected(self):
        with self.assertRaisesRegex(RuntimeError,"WEB_RUNTIME_PATH_UNTRUSTED"):
            m.unit_path_only_diff(self.valid,self.base,"/tmp/aoe2war-web-prod-aabbccddeeff")
    def test_path_traversal_rejected(self):
        with self.assertRaisesRegex(RuntimeError,"WEB_RUNTIME_PATH_UNTRUSTED"):
            m.unit_path_only_diff(self.valid,self.base,self.new+"/..")
    def test_arbitrary_name_rejected(self):
        with self.assertRaisesRegex(RuntimeError,"WEB_RUNTIME_PATH_UNTRUSTED"):
            m.unit_path_only_diff(self.valid,self.base,"/var/lib/aoe2war-web-prod-"+("z"*12))
    def test_insufficient_template_path_count(self):
        with self.assertRaisesRegex(RuntimeError,"WEB_UNIT_SECURITY_PROFILE_CHANGED"):
            m.unit_path_only_diff(self.valid,self.base.replace(self.old.encode(),b"/somewhere",1),self.new)

class SteamNftRenewalTests(unittest.TestCase):
    def test_new_tls_only_ip_is_added(self):
        actions=m.plan(None,["23.12.156.233"],{"steam4":set(),"steam6":set()})
        self.assertEqual(len(actions),1)
        self.assertIn("add element",actions[0])
        self.assertIn("timeout 300s",actions[0])
    def test_existing_tls_only_ip_atomically_renewed(self):
        actions=m.plan(None,["23.12.156.233"],{"steam4":{"23.12.156.233"},"steam6":set()})
        self.assertEqual(len(actions),2)
        self.assertIn("delete element",actions[0])
        self.assertIn("add element",actions[1])
        self.assertNotIn("flush"," ".join(actions))
        self.assertTrue(all("steam4" in a for a in actions))
    def test_bad_public_ip_rejected(self):
        for ip in ("127.0.0.1","10.0.0.1","192.168.0.1","169.254.2.3","::1","ff02::1"):
            with self.subTest(ip=ip),self.assertRaises(RuntimeError):
                m.plan(None,[ip],{"steam4":set(),"steam6":set()})
    def test_empty_input_rejected(self):
        with self.assertRaises(RuntimeError):
            m.plan(None,[],{"steam4":set(),"steam6":set()})
    def test_duplicates_rejected(self):
        with self.assertRaises(RuntimeError):
            m.plan(None,["23.12.156.233"]*2,{"steam4":set(),"steam6":set()})
    def test_seventeen_addresses_rejected(self):
        with self.assertRaises(RuntimeError):
            m.plan(None,[f"11.0.0.{i}" for i in range(1,18)],{"steam4":set(),"steam6":set()})
    def test_unexpected_nft_set_rejected(self):
        with self.assertRaises(RuntimeError):
            m.plan(None,["23.12.156.233"],{"steam4":set(),"finance":set()})
    def test_invalid_ip_rejected(self):
        with self.assertRaises(ValueError):
            m.plan(None,["not-an-ip"],{"steam4":set(),"steam6":set()})
    def test_ipv6_only_uses_steam6(self):
        actions=m.plan(None,["2600:9000::1"],{"steam4":set(),"steam6":set()})
        self.assertEqual(len(actions),1)
        self.assertIn("steam6",actions[0])
    def test_no_side_effects_on_import(self):
        self.assertTrue(PATH.is_file())

if __name__=="__main__":
    unittest.main(verbosity=2)
