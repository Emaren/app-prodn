"""Isolated observer resource/adversarial contracts; NO real SSH, keys or funds."""
from __future__ import annotations
import copy
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import aoe2_website_owner_observer_v3 as O

NOW = datetime(2026, 10, 25, 3, 0, tzinfo=timezone.utc)

def fixture():
    states = {}
    for name in O.UNITS:
        row = {"LoadState": "loaded", "ActiveState": "active" if name.endswith(".timer") or name in O.WOLO_SERVICES.values() or name == O.WEB_UNIT else "inactive",
               "SubState": "waiting" if name.endswith(".timer") else "running" if name in O.WOLO_SERVICES.values() or name == O.WEB_UNIT else "dead",
               "UnitFileState": "enabled" if name.endswith(".timer") else "static", "MainPID": 0}
        if name == O.WEB_UNIT: row.pop("MainPID")
        states[name] = row
    identities = {}
    for i, (label, name) in enumerate(O.WOLO_SERVICES.items(), 1009):
        identities[label] = {"pid": i, "inode": i + 20, "device": 1, "exe_sha256": O.EXPECTED_EXECUTABLES[label]}
        states[name]["MainPID"] = i
    return {"schema": 3, "kind": O.KIND, "observation_independent": False,
            "observation_scope": "configured_services_and_executing_binaries_only",
            "financial_writers_completely_enumerated": False,
            "financial_release_authorized": False, "custody_authorized": False,
            "claim_889_resolved": False, "source_p1_open": True,
            "collection_started_at": "2026-10-25T02:59:56Z",
            "collection_finished_at": "2026-10-25T03:00:00Z", "observed_at": "2026-10-25T03:00:00Z",
            "immutable": {**identities, "financial_units": states,
                "unit_config_sha256": {name: "a" * 64 for name in O.UNITS},
                "wolo_source_sha": O.WOLO_SOURCE, "source_p1_original": {
                    "key": "vps-source-drift", "status": "BLOCKED", "observed_source": O.WOLO_SOURCE,
                    "reviewed_source": O.REVIEWED_WOLO_SOURCE,
                    "detail": "VPS=" + O.WOLO_SOURCE + " implementation_baseline=" + O.REVIEWED_WOLO_SOURCE}},
            "website": {"source_sha": "a2b941f154fdc31ec4d6c4ece6d0e49036c48abd", "build_id": "fQ3sweWsBmfRKrrYGYz4w", "pid": 55, "inode": 99, "device": 1, "exe_sha256": "b" * 64}}

class OwnerObserverTests(unittest.TestCase):
    def test_active_financial_services_and_timers_are_measured_not_disabled_or_certified(self):
        packet = fixture()
        self.assertIs(O.validate_observation(packet, now=NOW), packet)
        self.assertFalse(packet["observation_independent"])
        self.assertFalse(packet["financial_writers_completely_enumerated"])
        for name in O.WOLO_SERVICES.values(): self.assertEqual(packet["immutable"]["financial_units"][name]["ActiveState"], "active")

    def test_no_financial_or_independence_escalation(self):
        for key in ("financial_release_authorized", "custody_authorized", "claim_889_resolved", "observation_independent", "financial_writers_completely_enumerated"):
            with self.subTest(key=key):
                value = fixture(); value[key] = True
                with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)
        value = fixture(); value["source_p1_open"] = False
        with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)

    def test_exact_schema_and_complete_known_scope(self):
        for key in fixture():
            with self.subTest(missing=key):
                value = fixture(); del value[key]
                with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)
        for schema in (True, 1, 2, "3"):
            value=fixture(); value["schema"]=schema
            with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)
        value=fixture(); value["independent_certificate"]=True
        with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)
        for field in ("financial_units", "unit_config_sha256"):
            value=fixture(); value["immutable"][field].pop(O.UNITS[0])
            with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)

    def test_stale_future_and_expired_during_io_are_refused(self):
        value = fixture()
        with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW+timedelta(seconds=91))
        # A small authenticated VPS clock lead must not block a fresh owner
        # observation: the operator measured ~1.6s ahead, not 90s stale.
        for lead in (timedelta(milliseconds=1), timedelta(seconds=1),
                     timedelta(seconds=3), timedelta(seconds=5)):
            with self.subTest(lead=lead):
                self.assertIs(O.validate_observation(value, now=NOW-lead), value)
        # The tolerance is deliberately bounded. Larger future stamps are
        # untrusted; aged packets never receive a matching grace extension.
        for lead in (timedelta(seconds=5, microseconds=1),
                     timedelta(seconds=6), timedelta(minutes=1)):
            with self.subTest(rejected_future=lead), self.assertRaises(O.Hold):
                O.validate_observation(value, now=NOW-lead)
        self.assertIs(O.validate_observation(value, now=NOW+timedelta(seconds=90)), value)
        with self.assertRaises(O.Hold):
            O.validate_observation(value, now=NOW+timedelta(seconds=90, microseconds=1))
        value["collection_started_at"] = "2026-10-25T02:59:19Z"
        with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)
        value=fixture(); value["collection_finished_at"]="2026-10-25T02:59:59Z"
        with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)
        # observe validates using current time AFTER the bounded SSH I/O returns.
        with patch.object(O, "_bounded_ssh", return_value=O.canonical(fixture())), patch.object(O, "datetime") as clock:
            clock.now.return_value=NOW+timedelta(seconds=91)
            with self.assertRaises(O.Hold): O.observe()

    def test_live_observe_respects_bounded_remote_clock_lead_and_old_packet_expiry(self):
        fresh=fixture()
        with patch.object(O, "_bounded_ssh", return_value=O.canonical(fresh)), patch.object(O, "datetime") as clock:
            clock.now.return_value=NOW-timedelta(seconds=3)
            self.assertEqual(O.observe()["observed_at"], fresh["observed_at"])
            clock.now.return_value=NOW-timedelta(seconds=6)
            with self.assertRaises(O.Hold): O.observe()
            clock.now.return_value=NOW+timedelta(seconds=91)
            with self.assertRaises(O.Hold): O.observe()

    def test_explicit_owner_reference_age_does_not_extend_fresh_observe(self):
        value=fixture()
        self.assertIs(O.validate_observation(value,now=NOW+timedelta(seconds=1199),max_age_seconds=1200),value)
        with self.assertRaises(O.Hold):O.validate_observation(value,now=NOW+timedelta(seconds=1201),max_age_seconds=1200)
        for age in (True,0,1201):
            with self.assertRaises(O.Hold):O.validate_observation(value,now=NOW,max_age_seconds=age)
        with patch.object(O,"_bounded_ssh",return_value=O.canonical(value)),patch.object(O,"datetime") as clock:
            clock.now.return_value=NOW+timedelta(seconds=91)
            with self.assertRaises(O.Hold):O.observe()

    def test_remote_read_command_is_also_size_bounded(self):
        namespace={"__name__":"isolated_fixture"};exec(O.REMOTE_PROGRAM,namespace)
        self.assertEqual(namespace["command"]([sys.executable,"-c","print('ok')"]),"ok")
        with self.assertRaisesRegex(RuntimeError,"output exceeded"):
            namespace["command"]([sys.executable,"-c","import sys;sys.stdout.buffer.write(b'x'*300000)"])
        with self.assertRaisesRegex(RuntimeError,"unavailable"):
            namespace["command"]([sys.executable,"-c","raise SystemExit(3)"])

    def test_remote_executing_pid_and_inode_races_fail_closed(self):
        namespace={"__name__":"isolated_fixture"};exec(O.REMOTE_PROGRAM,namespace)
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"executable";source.write_bytes(b"isolated-executable-fixture")
            file_stat=os.stat(source);real_open=os.open
            fake_os=types.SimpleNamespace(open=lambda *_:real_open(source,os.O_RDONLY),
                O_RDONLY=os.O_RDONLY,fstat=os.fstat,read=os.read,stat=lambda *_:file_stat,close=os.close)
            namespace["os"]=fake_os
            namespace["unit"]=lambda _: {"MainPID":42}
            row={"MainPID":42,"ActiveState":"active","SubState":"running"}
            self.assertEqual(namespace["execution"]("fixture.service",row)["pid"],42)
            namespace["unit"]=lambda _: {"MainPID":43}
            with self.assertRaisesRegex(RuntimeError,"PID changed"):namespace["execution"]("fixture.service",row)
            namespace["unit"]=lambda _: {"MainPID":42}
            changed=types.SimpleNamespace(**{name:getattr(file_stat,name) for name in ("st_mode","st_size","st_dev","st_ino","st_mtime_ns","st_ctime_ns")})
            changed.st_ino+=1;fake_os.stat=lambda *_:changed
            with self.assertRaisesRegex(RuntimeError,"inode changed"):namespace["execution"]("fixture.service",row)

    def test_changed_or_forged_executables_pid_inode_and_config_refused(self):
        for field, bad in (("pid",0),("pid",True),("inode",0),("device",-1),("exe_sha256","f"*64)):
            value=fixture(); value["immutable"]["wolo8092"][field]=bad
            with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)
        value=fixture(); value["immutable"]["financial_units"][O.WOLO_SERVICES["wolo8092"]]["MainPID"]+=1
        with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)
        value=fixture(); value["immutable"]["unit_config_sha256"][O.UNITS[0]]="0"*64
        with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)
        value=fixture(); value["immutable"]["wolo_source_sha"]="f"*40
        with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)

    def test_financial_unit_or_timer_suppression_does_not_become_green(self):
        for unit in (*O.WOLO_SERVICES.values(), *(name+".timer" for name in O.TIMER_FAMILIES)):
            value=fixture(); value["immutable"]["financial_units"][unit]["ActiveState"]="inactive"
            with self.subTest(unit=unit), self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)

    def test_untrusted_response_encodings_and_legacy_witness_packets(self):
        for raw in (b"{}", b'{"schema":3,"schema":3}', b'{"schema":NaN}', b"\xff", b"[]", b"x"*(O.MAX_OUTPUT+1)):
            with self.subTest(raw=raw[:30]), self.assertRaises(O.Hold):
                O.validate_observation(O._strict_packet(raw), now=NOW)
        value=fixture(); value["kind"]="aoe2war-independent-runtime-witness-v1"
        with self.assertRaises(O.Hold): O.validate_observation(value, now=NOW)

    def test_authenticated_ssh_options_no_arbitrary_remote_command_or_host_option(self):
        with patch.object(O,"_bounded_ssh",return_value=O.canonical(fixture())) as call:
            O.observe(now=NOW)
            args, program=call.call_args.args
            self.assertEqual(args[-3:],["root@hel1","python3","-"])
            self.assertIn("StrictHostKeyChecking=yes",args);self.assertIn("BatchMode=yes",args)
            self.assertEqual(program,O.REMOTE_PROGRAM.encode())
        for target in ("-oProxyCommand=bad", "root@hel1;id", "host\nother", "root@host/path"):
            with self.assertRaises(O.Hold): O.observe(host=target,now=NOW)

    def test_pipe_resource_limits_and_transport_errors(self):
        code="import sys;sys.stdin.buffer.read();sys.stdout.buffer.write(b'ok')"
        self.assertEqual(O._bounded_ssh([sys.executable,"-c",code],b"fixed-program"),b"ok")
        for destination, size in (("stdout",O.MAX_OUTPUT+1),("stderr",O.MAX_STDERR+1)):
            code=f"import sys;sys.stdin.buffer.read();sys.{destination}.buffer.write(b'x'*{size})"
            with self.subTest(destination=destination), self.assertRaises(O.Hold): O._bounded_ssh([sys.executable,"-c",code],b"fixed-program")
        with self.assertRaises(O.Hold): O._bounded_ssh([sys.executable,"-c","raise SystemExit(2)"],b"fixed-program")
        with patch.object(O,"MAX_SECONDS",0.15), self.assertRaises(O.Hold):
            O._bounded_ssh([sys.executable,"-c","import time;time.sleep(10)"],b"fixed-program")

    def test_remote_program_has_only_finite_read_operations(self):
        namespace={"__name__":"isolated_fixture"};exec(O.REMOTE_PROGRAM,namespace)
        for path in ("/etc/wolochain/../../root/key", "/root/.ssh/id_rsa", "/tmp/arbitrary", "/etc/wolochain/a\\b"):
            with self.subTest(path=path), self.assertRaises(RuntimeError): namespace["hash_config"](path)
        program=O.REMOTE_PROGRAM
        for prohibited in ("systemctl','stop", "systemctl','restart", "subprocess.run(['curl'", "sqlite", "pg_dump", "psql", "PRIVATE KEY", "keyring"):
            self.assertNotIn(prohibited,program)
        self.assertIn("os.O_RDONLY",program);self.assertIn("os.O_NOFOLLOW",program)
        self.assertIn("configured service/writer state changed during capture",program)
        self.assertIn("executing inode changed during hash",program)

    def test_timer_dbus_interface_does_not_invent_service_execution_properties(self):
        namespace={"__name__":"isolated_fixture"};exec(O.REMOTE_PROGRAM,namespace)
        raw="LoadState=loaded\nActiveState=active\nSubState=waiting\nUnitFileState=enabled\nFragmentPath=/etc/systemd/system/fixture.timer\nDropInPaths="
        namespace["command"]=lambda _:raw
        row=namespace["unit"]("fixture.timer")
        self.assertEqual(row["MainPID"],0);self.assertEqual(row["EnvironmentFiles"],"")
        with self.assertRaisesRegex(RuntimeError,"service metadata"):namespace["unit"]("fixture.service")
        namespace["command"]=lambda _:raw+"\nMainPID=42"
        with self.assertRaisesRegex(RuntimeError,"unexpected timer"):namespace["unit"]("fixture.timer")
        namespace["command"]=lambda _:raw.replace("LoadState=loaded","LoadState=not-found")
        with self.assertRaisesRegex(RuntimeError,"unit unavailable"):namespace["unit"]("fixture.timer")

    def test_repeated_environment_files_are_ordered_refs_not_duplicate_json(self):
        namespace={"__name__":"isolated_fixture"};exec(O.REMOTE_PROGRAM,namespace)
        raw="LoadState=loaded\nActiveState=active\nSubState=running\nUnitFileState=enabled\nMainPID=42\nFragmentPath=/etc/systemd/system/fixture.service\nDropInPaths=\nEnvironmentFiles=/etc/wolochain/first.env (ignore_errors=no)\nEnvironmentFiles=/etc/wolochain/second.env (ignore_errors=yes)"
        captured=[]
        namespace["command"]=lambda args:(captured.append(args) or raw)
        row=namespace["unit"]("fixture.service")
        self.assertIn("--all",captured[0])
        self.assertEqual(row["EnvironmentFiles"],"/etc/wolochain/first.env (ignore_errors=no) /etc/wolochain/second.env (ignore_errors=yes)")
        namespace["hash_config"]=lambda path,optional=False:[path,optional]
        first=namespace["config"](row)
        swapped=dict(row,EnvironmentFiles="/etc/wolochain/second.env (ignore_errors=yes) /etc/wolochain/first.env (ignore_errors=no)")
        self.assertNotEqual(first,namespace["config"](swapped))
        namespace["command"]=lambda _:raw+"\nMainPID=43"
        with self.assertRaisesRegex(RuntimeError,"malformed"):namespace["unit"]("fixture.service")

    def test_empty_service_environment_array_is_legitimate_systemd_serialization(self):
        namespace={"__name__":"isolated_fixture"};exec(O.REMOTE_PROGRAM,namespace)
        raw="LoadState=loaded\nActiveState=inactive\nSubState=dead\nUnitFileState=static\nMainPID=0\nFragmentPath=/etc/systemd/system/fixture.service\nDropInPaths="
        namespace["command"]=lambda _:raw
        self.assertEqual(namespace["unit"]("fixture.service")["EnvironmentFiles"],"")
        namespace["command"]=lambda _:raw.replace("MainPID=0\n","")
        with self.assertRaisesRegex(RuntimeError,"service metadata"):namespace["unit"]("fixture.service")

    def test_remote_configuration_path_size_and_changed_file_fail_closed(self):
        namespace={"__name__":"isolated_fixture"};exec(O.REMOTE_PROGRAM,namespace)
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"config";source.write_bytes(b"private-config-never-output")
            actual_stat=os.stat(source)
            protected=types.SimpleNamespace(**{name:getattr(actual_stat,name) for name in ("st_mode","st_size","st_dev","st_ino","st_mtime_ns","st_ctime_ns","st_gid")},st_uid=0)
            real_open=os.open
            fake_os=types.SimpleNamespace(path=types.SimpleNamespace(realpath=lambda _:"/etc/wolochain/fixture.env",basename=os.path.basename),
                open=lambda *_:real_open(source,os.O_RDONLY),O_RDONLY=os.O_RDONLY,O_NOFOLLOW=os.O_NOFOLLOW,
                fstat=lambda _:protected,read=os.read,stat=lambda *_args,**_kw:protected,close=os.close)
            namespace["os"]=fake_os
            namespace["open_config_file"]=lambda _:real_open(source,os.O_RDONLY)
            hashed=namespace["hash_config"]("/etc/wolochain/fixture.env")
            self.assertEqual(hashed[-1],O.hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertNotIn("private-config",str(hashed))
            changed=copy.copy(protected);changed.st_ino+=1
            fake_os.stat=lambda *_args,**_kw:changed
            with self.assertRaisesRegex(RuntimeError,"changed during read"):namespace["hash_config"]("/etc/wolochain/fixture.env")
            fake_os.stat=lambda *_args,**_kw:protected
            protected.st_size=1024*1024+1
            with self.assertRaisesRegex(RuntimeError,"oversized"):namespace["hash_config"]("/etc/wolochain/fixture.env")

    def test_exact_private_api_environment_owner_mode_and_symlink_rules(self):
        namespace={"__name__":"isolated_fixture"};exec(O.REMOTE_PROGRAM,namespace)
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/"config";source.write_bytes(b"fixture-secret-not-logged")
            real=os.stat(source);real_open=os.open
            protected=types.SimpleNamespace(**{name:getattr(real,name) for name in ("st_size","st_dev","st_ino","st_mtime_ns","st_ctime_ns","st_gid")},st_uid=1000,st_mode=0o100600)
            api="/var/www/AoE2HDBets/api-prodn/.env.production"
            fake_os=types.SimpleNamespace(path=types.SimpleNamespace(realpath=lambda p:p,basename=os.path.basename,islink=lambda _:False),
                fstat=lambda _:protected,read=os.read,stat=lambda *_args,**_kw:protected,close=os.close)
            namespace["os"]=fake_os;namespace["pwd"]=types.SimpleNamespace(getpwnam=lambda _:types.SimpleNamespace(pw_uid=1000))
            namespace["open_config_file"]=lambda _:real_open(source,os.O_RDONLY)
            first=namespace["hash_config"](api)
            self.assertEqual(first[2],1000);self.assertEqual(first[4],0o600)
            for uid,mode in ((1001,0o100600),(1000,0o100644),(1000,0o100660)):
                protected.st_uid=uid;protected.st_mode=mode
                with self.assertRaisesRegex(RuntimeError,"unprotected"):namespace["hash_config"](api)
            protected.st_uid=1000;protected.st_mode=0o100600
            fake_os.path.islink=lambda _:True
            with self.assertRaisesRegex(RuntimeError,"scope"):namespace["hash_config"](api)
            fake_os.path.islink=lambda _:False
            with self.assertRaisesRegex(RuntimeError,"scope"):namespace["hash_config"]("/var/www/AoE2HDBets/api-prodn/.env.other")
            for path in ("/etc/wolochain-mainnet-settlement.env","/etc/wolochain-founder-rewards-settlement.env","/etc/wolochain-mainnet/wolochaind-mainnet.env"):
                protected.st_uid=0
                self.assertEqual(namespace["hash_config"](path)[2],0)
            protected.st_uid=1000
            with self.assertRaisesRegex(RuntimeError,"unprotected"):namespace["hash_config"]("/etc/wolochain-mainnet-settlement.env")

    def test_directory_descriptor_walk_refuses_symlinked_configuration_sources(self):
        namespace={"__name__":"isolated_fixture"};exec(O.REMOTE_PROGRAM,namespace)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();actual=root/"actual";actual.mkdir();(actual/"config").write_bytes(b"fixture")
            fd=namespace["open_config_file"](str(actual/"config"))
            self.assertEqual(os.read(fd,20),b"fixture");os.close(fd)
            (root/"linked").symlink_to(actual,target_is_directory=True)
            with self.assertRaises(OSError):namespace["open_config_file"](str(root/"linked/config"))
            (actual/"linked-file").symlink_to(actual/"config")
            with self.assertRaises(OSError):namespace["open_config_file"](str(actual/"linked-file"))

if __name__ == "__main__":unittest.main()
