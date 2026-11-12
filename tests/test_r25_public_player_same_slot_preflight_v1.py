"""Positive/negative pure preflight with NO host reads or privileged commands."""
import importlib.util
from pathlib import Path
import unittest
import copy

S=Path(__file__).resolve().parents[1]/"scripts/release/r25_public_player_same_slot_preflight_v1.py"
spec=importlib.util.spec_from_file_location("r25_public_player_slot_v1",S)
m=importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(m)

def base():
    old=m.ORIGINAL_DIR
    unit=(
        f"[Service]\nUser=aoe2war-web-prod\nGroup=aoe2war-web-prod\n"
        f"WorkingDirectory={old}\n"
        f"ExecStart=/usr/bin/node --max-old-space-size=2048 ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3032\n"
        f"ProtectHome=yes\nProtectSystem=strict\nMemoryMax=3200M\n"
        f"ReadOnlyPaths={old}/public\nBindReadOnlyPaths={old}/.next\n"
        f"StateDirectory={old}\n"
    ).encode()
    assert unit.count(old.encode())==4
    pins=copy.deepcopy(m.PIN)
    pins["unit_sha"]=m.checksum(unit)
    facts={k:pins[k] for k in ("source","build","web_pid","rollback_pid","paper_pid",
        "unit_sha","preloader_sha","steam_script_sha","steam_unit_sha","steam_lock_dropin_sha","web_user","web_group")}
    facts.update(
        web_state="active",rollback_state="active",paper_state="active",
        web_restarts="0",rollback_restarts="0",paper_restarts="0",
        steam_timer="active",financial_listeners=[],selector_count=6,
        available_mem_kib=1_900_000,root_free_bytes=25*1024**3,
        volume_free_bytes=48*1024**3,web_memory_limit=3355443200)
    return facts,unit,pins

class ExactSlot(unittest.TestCase):
    def refuse(self,tag, change=None, unit_transform=None):
        facts,unit,pins=base()
        if change: facts.update(change)
        if unit_transform:unit=unit_transform(unit);facts["unit_sha"]=m.checksum(unit);pins["unit_sha"]=m.checksum(unit)
        with self.assertRaises(m.Hold) as err:
            m.evaluate(facts,unit,pins)
        self.assertIn(tag,str(err.exception))
    def test_positive_read_only_plan_has_no_release_authority(self):
        facts,unit,pins=base()
        r=m.evaluate(facts,unit,pins)
        self.assertFalse(r["deployment_authorized"])
        self.assertFalse(r["third_web_runtime_authorized"])
        self.assertFalse(r["rollback_executed"])
        self.assertEqual(r["old_path_references_replaced"],4)
        self.assertIn("RESTRICTED_3032",r["rollback_policy"])
    def test_web_pid_drift(self):self.refuse("PIN_WEB_PID",{"web_pid":"701399"})
    def test_legacy_rollback_pid_drift(self):self.refuse("PIN_ROLLBACK_PID",{"rollback_pid":"1"})
    def test_steam_script_drift(self):self.refuse("PIN_STEAM_SCRIPT_SHA",{"steam_script_sha":"0"*64})
    def test_v22_native_service_hash_required(self):
        self.assertEqual(m.STEAM_UNIT_SHA,
            "44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a")
        self.refuse("PIN_STEAM_UNIT_SHA",{"steam_unit_sha":
            "b976a10d5cc8b3c199974f1b85a912a67323e8b57b4f69325a1061428d20deb2"})
    def test_exact_single_lock_only_dropin_required(self):
        self.assertEqual(m.STEAM_LOCK_ONLY_DROPIN_SHA,
            "34d66d8b1684ed23c3ddae2fb3cc66ca3b1ab26bc4f6bb1fae378012f03e5920")
        self.refuse("PIN_STEAM_LOCK_DROPIN_SHA",{"steam_lock_dropin_sha":"0"*64})
    def test_v20_inverse_source_binary_stays_pinned(self):
        facts,unit,pins=base()
        result=m.evaluate(facts,unit,pins)
        self.assertTrue(result["steam_v20_inverse_binary_preserved"])
        self.assertTrue(result["steam_v22_service_admitted"])
        self.assertTrue(result["steam_lock_only_dropin_pinned"])
    def test_steam_timer_inactive(self):self.refuse("STEAM_TIMER_STATE",{"steam_timer":"inactive"})
    def test_finance_listeners_open(self):self.refuse("PROTECTED_FINANCE_LISTENER",{"financial_listeners":[8094]})
    def test_nginx_selector_drift(self):self.refuse("NGINX_SELECTOR_DRIFT",{"selector_count":5})
    def test_memory_headroom_low(self):self.refuse("MEMORY_HEADROOM",{"available_mem_kib":125})
    def test_root_disk_pressure(self):self.refuse("ROOT_DISK_HEADROOM",{"root_free_bytes":13*1024**3})
    def test_volume_pressure(self):self.refuse("VOLUME_DISK_HEADROOM",{"volume_free_bytes":2*1024**3})
    def test_build_marker_wrong(self):self.refuse("PIN_BUILD",{"build":"other"})
    def test_source_marker_wrong(self):self.refuse("PIN_SOURCE",{"source":"c"*40})
    def test_external_unit_hash_drift(self):self.refuse("PIN_UNIT_SHA",{"unit_sha":"0"*64})
    def test_unexpected_fifth_runtime_reference(self):
        self.refuse("FOUR_EXACT_RUNTIME_REFERENCES",unit_transform=lambda u:u+b"#"+m.ORIGINAL_DIR.encode()+b"\n")
    def test_embedded_finance_port(self):
        self.refuse("FINANCIAL_UNIT_PORT_DRIFT",unit_transform=lambda u:u+b"# bad 8092\n")
    def test_unexpected_port(self):
        self.refuse("WEBSITE_SAME_SLOT_UNIT",unit_transform=lambda u:u.replace(b"--port 3032",b"--port 3033"))
    def test_writable_ram_limit_drift(self):
        self.refuse("UNIT_PROTECTION_DRIFT",unit_transform=lambda u:u.replace(b"MemoryMax=3200M",b"MemoryMax=infinity"))
    def test_restart_counter(self):self.refuse("SERVICE_RESTART_DRIFT",{"web_restarts":"1"})
    def test_unsupported_service_state(self):self.refuse("ACTIVE_RUNTIME_STATE",{"rollback_state":"inactive"})
    def test_readonly_user_drift(self):self.refuse("PIN_WEB_USER",{"web_user":"root"})

if __name__=="__main__":unittest.main(verbosity=2)
