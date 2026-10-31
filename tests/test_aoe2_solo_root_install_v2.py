"""Adversarial unit tests for source-derived HEL1 root helper installer v2.

No host setup, root, SSH, financial operation, or private keys needed.
"""
from __future__ import annotations
import base64, hashlib, io, json, os, pathlib, stat, subprocess, sys, tarfile, tempfile, unittest
from unittest import mock
here=pathlib.Path(__file__).resolve().parent
script_dir=here.parent/"scripts"
sys.path.insert(0,str(script_dir if (script_dir/"aoe2_solo_root_install_v2.py").exists() else here))
import aoe2_solo_root_install_v2 as m

SAFE="a9525f46302edff88ed073743a7dfaed08be9e3e"
PREV="33e0f42b3d34d324b6cbab6c0347d4f5aff6fb8a"
SHA="a58e2416415665e2334ce884cebc2c3f64ce75b5"

def fixture():
    files={n:("# source "+n+"\n").encode() for n in m.MODULES}
    files["aoe2_solo_website_root_phase.py"]=(
      "TRAINS={'W1_SAFE':('"+SAFE+"','"+PREV+"')}\nKEY_FP='"+m.KEY_FP+"'\n").encode()
    files["aoe2_solo_website_native_issuer.py"]=("#!/usr/bin/python3 -I\nW1_SAFE='"+SAFE+"'\n").encode()
    files["aoe2_solo_website_producer_intake.py"]=("#!/usr/bin/python3 -I\nW1_SAFE='"+SAFE+"'\n").encode()
    bundle=m.bundle_bytes(files)
    targets={p:m.hash256(files[n]) for n,paths in m.MODULES.items() for p in paths}
    manifest={"schema":"aoe2war.hel1.root-install.v2", "controller_commit":SHA,
      "w1_safe_candidate":SAFE,"w1_safe_previous":PREV,
      "bundle_sha256":m.hash256(bundle),"bundle_bytes":len(bundle),
      "source_git_blobs":{n:m.blobid(files[n]) for n in sorted(files)},
      "source_sha256":{n:m.hash256(files[n]) for n in sorted(files)},
      "targets_sha256":dict(sorted(targets.items())),
      "owner_rsa_spki_sha256":m.KEY_FP,
      "original_lock":list(m.EXPECTED_LOCK),
      "ssh_key_fingerprints":m.FINGERPRINTS,
      "financial_release_authorized":False,"root_install_authorized":False}
    return files,bundle,manifest

class RootManifestTests(unittest.TestCase):
    def test_bundle_reproducible_with_fixed_mtime(self):
        files,bundle,_=fixture()
        self.assertEqual(bundle,m.bundle_bytes(dict(reversed(list(files.items())))))
        self.assertEqual(m.unpack(bundle),files)
        self.assertIn(b"\x00\x00\x00\x00",bundle[:10])

    def test_source_exact_positive_14_targets_with_signed_intake(self):
        files,bundle,manifest=fixture()
        got,targets=m.source_admit(manifest,bundle,SHA)
        self.assertEqual(got,files)
        self.assertEqual(len(targets),14)
        self.assertEqual(len(m.MODULES),12)
        self.assertEqual(targets["solo-v1-producer-intake"],m.hash256(files["aoe2_solo_website_producer_intake.py"]))
        self.assertEqual(targets["solo-v1-native-admission"],m.hash256(files["aoe2_solo_website_native_issuer.py"]))

    def test_source_commit_or_safe_sha_swap_denied(self):
        _,bundle,manifest=fixture()
        for key,value in [("controller_commit","a"*40),("w1_safe_candidate","b"*40),
                          ("w1_safe_previous","c"*40)]:
            broken=dict(manifest);broken[key]=value
            with self.subTest(key=key),self.assertRaises(m.Hold):
                m.source_admit(broken,bundle,SHA)

    def test_single_module_modified_or_wrong_sha_denied(self):
        files,bundle,manifest=fixture()
        altered=dict(files);altered["aoe2_solo_website_command_channel.py"]+=b"# replaced\n"
        with self.assertRaisesRegex(m.Hold,"BUNDLE_SHA_MISMATCH"):
            m.source_admit(manifest,m.bundle_bytes(altered),SHA)
        bad=dict(manifest);bad["source_sha256"]=dict(manifest["source_sha256"])
        bad["source_sha256"]["aoe2_solo_website_native_issuer.py"]="0"*64
        with self.assertRaisesRegex(m.Hold,"SOURCE_MEMBER_DRIFT"):
            m.source_admit(bad,bundle,SHA)

    def test_archive_link_and_directory_traversal_denied(self):
        files,bundle,manifest=fixture()
        for mode in ("link","traversal"):
            stream=io.BytesIO()
            with tarfile.open(fileobj=stream,mode="w:gz") as t:
                x=tarfile.TarInfo("../escape" if mode=="traversal" else "aoe2_solo_website_native_issuer.py")
                if mode=="link":x.type=tarfile.SYMTYPE;x.linkname="/etc/shadow"
                t.addfile(x)
            with self.subTest(mode=mode),self.assertRaisesRegex(m.Hold,"BUNDLE_UNEXPECTED_ENTRY"):
                m.unpack(stream.getvalue())

    def test_manifest_duplicate_json_rejected(self):
        with self.assertRaisesRegex(m.Hold,"DUPLICATE_JSON_FIELD"):
            m.parse(b'{"controller_commit":"a","controller_commit":"b"}')

    def test_manifest_cannot_authorize_finance_or_install(self):
        _,bundle,manifest=fixture()
        for field in ("financial_release_authorized","root_install_authorized"):
            altered=dict(manifest);altered[field]=True
            with self.subTest(field=field),self.assertRaisesRegex(m.Hold,"MANIFEST_AUTHORITY_ESCALATION"):
                m.source_admit(altered,bundle,SHA)

    def test_missing_source_and_signer_module_denied(self):
        files,_,_=fixture()
        for missing in ("aoe2_solo_website_native_issuer.py","aoe2_solo_website_producer_intake.py"):
            one=dict(files);del one[missing]
            with self.subTest(missing=missing),self.assertRaisesRegex(m.Hold,"INCOMPLETE_BUNDLE"):
                m.unpack(m.bundle_bytes(one))

    def test_owner_key_or_original_lock_manifest_mismatch_denied(self):
        _,bundle,manifest=fixture()
        for key,value in [("owner_rsa_spki_sha256","a"*64),("original_lock",[1,2,3,4]),
                          ("ssh_key_fingerprints",{})]:
            altered=dict(manifest);altered[key]=value
            with self.subTest(key=key),self.assertRaises(m.Hold):
                m.source_admit(altered,bundle,SHA)

    def test_trust_digest_exact_three_roles(self):
        files,_,_=fixture()
        trust=m.parse(m.trust_bytes(files))
        self.assertEqual(set(trust),{"observer","channel","phase"})
        self.assertEqual(trust["channel"],m.hash256(files["aoe2_solo_website_command_channel.py"]))

    def test_bogus_owner_approval_rejected_without_key_read(self):
        with mock.patch.object(m,"read_file",return_value=b'{"schema":"wrong","payload":{},"signature_base64":""}'):
            with self.assertRaisesRegex(m.Hold,"INSTALL_APPROVAL_SCHEMA"):
                m.permit("install","a"*64,SHA)

    def test_key_wire_rejects_rsa_and_duplicated_spaces(self):
        for bad in ("ssh-rsa AAAA", "ssh-ed25519  AAAA", "ssh-ed25519 AAAA"):
            with self.subTest(k=bad),self.assertRaises(m.Hold):m.key_wire(bad)

    def test_flock_busy_prevents_rollback_while_original_channel_active(self):
        import fcntl as locklib
        with tempfile.TemporaryDirectory() as td:
            lock=pathlib.Path(td)/"release.lock";lock.write_bytes(b"x")
            fd=os.open(lock,os.O_RDONLY)
            try:
                locklib.flock(fd,locklib.LOCK_EX|locklib.LOCK_NB)
                info=lock.stat()
                new_identity=(info.st_dev,info.st_ino,info.st_uid,stat.S_IMODE(info.st_mode))
                with mock.patch.object(m,"LOCK",lock),mock.patch.object(m,"EXPECTED_LOCK",new_identity):
                    with self.assertRaisesRegex(m.Hold,"ORIGINAL_FD200_SESSION_STILL_ACTIVE"):
                        m.assert_original_lease_idle()
            finally:
                locklib.flock(fd,locklib.LOCK_UN);os.close(fd)

    def test_owner_typed_consent_mandatory(self):
        with mock.patch.object(sys.stdin,"isatty",return_value=False):
            with self.assertRaisesRegex(m.Hold,"INTERACTIVE_OWNER_TTY_REQUIRED"):
                m.typed_consent("install",SHA)

    def test_rollback_denies_enrolled_ssh_identity(self):
        raw=b'ssh-ed25519 '+b'A'*72+b'\n'
        with mock.patch.object(pathlib.Path,"exists",return_value=True),\
             mock.patch.object(m,"read_file",side_effect=[raw,b'{"observer":"ssh-ed25519 '+b'A'*72+b'","command":"ssh-ed25519 '+b'B'*72+b'"}']):
            with self.assertRaisesRegex(m.Hold,"SSH_ROLE_STILL_ENROLLED"):
                m.check_absent_ssh()

    def test_git_build_uses_exact_blob_commit_and_no_editable_checkout(self):
        files,_,_=fixture()
        def pretend_git(repo,*args):
            if args[:2]==("rev-parse","HEAD"):return (SHA+"\n").encode()
            if args[:2]==("status","--porcelain"):return b""
            if args[0]=="show":return files[args[1].split(":",1)[1].split("/")[-1]]
            if args[0]=="rev-parse":return (m.blobid(files[args[1].split(":",1)[1].split("/")[-1]])+"\n").encode()
            raise AssertionError(args)
        with tempfile.TemporaryDirectory() as td, mock.patch.object(m,"git",side_effect=pretend_git):
            m.build(td,SHA,td)
            self.assertEqual(len(list(pathlib.Path(td).glob("*.json"))),1)
            self.assertEqual(len(list(pathlib.Path(td).glob("*.gz"))),1)
            with self.assertRaises(FileExistsError):m.build(td,SHA,td)

    def test_source_checkout_sha_dirty_or_modified_blob_denied(self):
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(m,"git",return_value=b"b"*40+b"\n"):
                with self.assertRaisesRegex(m.Hold,"SOURCE_HEAD_NOT_PINNED"):m.build(td,SHA,td)

    def test_exact_sha_root_plan_wrapper_has_no_install_path(self):
        here=pathlib.Path(__file__).resolve().parent
        candidate=here.parent/"deploy/solo-native-audit/r16_hel1_root_plan_only.sh"
        if not candidate.is_file():candidate=here/"r16_hel1_root_plan_only.sh"
        self.assertTrue(candidate.is_file(),str(candidate))
        checked=subprocess.run(["/usr/bin/bash","-n",str(candidate)],capture_output=True,text=True)
        self.assertEqual(checked.returncode,0,checked.stderr)
        raw=candidate.read_text()
        self.assertIn('os.O_NOFOLLOW|os.O_CLOEXEC',raw)
        self.assertIn('sys.argv=[script,"plan"',raw)
        self.assertNotIn('sys.argv=[script,"install"',raw)
        self.assertIn('SOURCE_IS_NOT_INDEPENDENTLY_REVIEWED_INSTALLER',raw)
        # Even invoked with bogus pins, an unrelated host must fail before sudo.
        actual=subprocess.run(["/usr/bin/bash",str(candidate),"a"*40,"b"*64,"c"*64,
            "/tmp/not-installed","/tmp/not-manifest","/tmp/not-bundle"],
            capture_output=True,text=True,timeout=4)
        if os.uname().nodename != "ubuntu-4gb-hel1-11":
            self.assertNotEqual(actual.returncode,0)
            self.assertIn("HOLD: EXPECTED_NATIVE_HEL1_TONY_UID1000",actual.stdout)

    def test_lock_file_original_identity_is_mandatory(self):
        class St:st_mode=stat.S_IFREG|0o644;st_dev=2064;st_ino=6185748;st_uid=1000
        with mock.patch.object(pathlib.Path,"lstat",return_value=St()):
            with self.assertRaisesRegex(m.Hold,"ORIGINAL_LOCK_IDENTITY_CHANGED"):
                m.native_lock_and_keys()


    def test_native_binary_must_have_exact_interpreter(self):
        files,_,_=fixture()
        altered=dict(files)
        altered["aoe2_solo_website_native_issuer.py"]=b"#!/bin/sh\nW1_SAFE='"+SAFE.encode()+b"'\n"
        bundle=m.bundle_bytes(altered)
        _,_,manifest=fixture()
        manifest["bundle_sha256"]=m.hash256(bundle)
        manifest["bundle_bytes"]=len(bundle)
        for key,fun in (("source_git_blobs",m.blobid),("source_sha256",m.hash256)):
            manifest[key]=dict(manifest[key]);manifest[key]["aoe2_solo_website_native_issuer.py"]=fun(altered["aoe2_solo_website_native_issuer.py"])
        manifest["targets_sha256"]=dict(manifest["targets_sha256"])
        manifest["targets_sha256"]["solo-v1-native-admission"]=m.hash256(altered["aoe2_solo_website_native_issuer.py"])
        with self.assertRaisesRegex(m.Hold,"NATIVE_ISSUER_ENTRYPOINT_INTERPRETER_DRIFT"):
            m.source_admit(manifest,bundle,SHA)

    def test_intake_source_sha_must_match_issuer_and_root_phase(self):
        files,_,manifest=fixture()
        altered=dict(files)
        altered["aoe2_solo_website_producer_intake.py"]=b"#!/usr/bin/python3 -I\nW1_SAFE='"+b"f"*40+b"'\n"
        archive=m.bundle_bytes(altered)
        manifest["bundle_sha256"]=m.hash256(archive)
        manifest["bundle_bytes"]=len(archive)
        for key,fn in (("source_git_blobs",m.blobid),("source_sha256",m.hash256)):
            manifest[key]=dict(manifest[key]);manifest[key]["aoe2_solo_website_producer_intake.py"]=fn(altered["aoe2_solo_website_producer_intake.py"])
        manifest["targets_sha256"]=dict(manifest["targets_sha256"])
        manifest["targets_sha256"]["solo-v1-producer-intake"]=m.hash256(altered["aoe2_solo_website_producer_intake.py"])
        with self.assertRaisesRegex(m.Hold,"INTAKE_SAFE_SHA_CONFLICT"):
            m.source_admit(manifest,archive,SHA)

    def test_intake_entrypoint_cannot_be_interpreted_as_shell(self):
        files,_,manifest=fixture()
        altered=dict(files)
        altered["aoe2_solo_website_producer_intake.py"]=b"#!/bin/sh\nW1_SAFE='"+SAFE.encode()+b"'\n"
        archive=m.bundle_bytes(altered)
        manifest["bundle_sha256"]=m.hash256(archive)
        manifest["bundle_bytes"]=len(archive)
        for key,fn in (("source_git_blobs",m.blobid),("source_sha256",m.hash256)):
            manifest[key]=dict(manifest[key]);manifest[key]["aoe2_solo_website_producer_intake.py"]=fn(altered["aoe2_solo_website_producer_intake.py"])
        manifest["targets_sha256"]=dict(manifest["targets_sha256"])
        manifest["targets_sha256"]["solo-v1-producer-intake"]=m.hash256(altered["aoe2_solo_website_producer_intake.py"])
        with self.assertRaisesRegex(m.Hold,"NATIVE_INTAKE_ENTRYPOINT_INTERPRETER_DRIFT"):
            m.source_admit(manifest,archive,SHA)

    def test_owner_permit_reencoding_cannot_bypass_durable_replay_marker(self):
        # Same canonical owner-authorized operation, exact source, manifest and
        # time interval has ONE identity even if a new envelope uses different
        # JSON formatting/property order/signature representation.
        payload={"operation":"install","manifest_sha256":"a"*64,
                 "controller_commit":SHA,"issued_at":"2026-10-30T00:00:00Z",
                 "expires_at":"2026-10-30T00:15:00Z"}
        envelope_a={"schema":"aoe2war.hel1.root-install.permit.v2",
                    "payload":payload,"signature_base64":"PLACEHOLDER_SIGNATURE_A"}
        envelope_b={"signature_base64":"PLACEHOLDER_SIGNATURE_B",
                    "payload":dict(reversed(list(payload.items()))),
                    "schema":"aoe2war.hel1.root-install.permit.v2"}
        parsed_a=m.parse(json.dumps(envelope_a,indent=4).encode())
        parsed_b=m.parse(json.dumps(envelope_b,separators=(",",":")).encode())
        self.assertNotEqual(
            m.hash256(json.dumps(envelope_a,indent=4).encode()),
            m.hash256(json.dumps(envelope_b,separators=(",",":")).encode()))
        once=m.permit_identity(parsed_a["payload"])
        self.assertEqual(once,m.permit_identity(parsed_b["payload"]))
        self.assertEqual(once,m.hash256(m.DOM+m.canonical(payload)))
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(m,"CONFIG",pathlib.Path(td)),mock.patch.object(m,"protected",return_value=None),mock.patch.object(m.os,"chown",return_value=None):
                m.consume_permit(once,"install","a"*64)
                with self.assertRaisesRegex(m.Hold,"OWNER_INSTALL_PERMIT_REPLAY"):
                    m.consume_permit(m.permit_identity(parsed_b["payload"]),"install","a"*64)

    def test_signed_permit_consumption_is_one_time(self):
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(m,"CONFIG",pathlib.Path(td)),mock.patch.object(m,"protected",return_value=None),mock.patch.object(m.os,"chown",return_value=None):
                # CI is unprivileged: emulate only root chown after O_EXCL/fsync;
                # real installer still requires EUID0 and a protected root tree.
                first=m.consume_permit("a"*64,"install","b"*64)
                self.assertTrue(first.is_file())
                with self.assertRaisesRegex(m.Hold,"OWNER_INSTALL_PERMIT_REPLAY"):
                    m.consume_permit("a"*64,"install","b"*64)
                self.assertTrue(first.is_file())

    def test_owner_approval_operation_and_exact_commit_scope(self):
        payload={"schema":"aoe2war.hel1.root-install.permit.v2",
                 "payload":{"operation":"install","manifest_sha256":"a"*64,
                            "controller_commit":SHA,"issued_at":"2026-10-30T00:00:00Z",
                            "expires_at":"2026-10-30T00:15:00Z"},"signature_base64":"AAAA"}
        with mock.patch.object(m,"read_file",return_value=m.canonical(payload)):
            with self.assertRaisesRegex(m.Hold,"OWNER_APPROVAL_SCOPE"):
                m.permit("rollback","a"*64,SHA)
            with self.assertRaisesRegex(m.Hold,"OWNER_APPROVAL_SCOPE"):
                m.permit("install","a"*64,"f"*40)

    def test_install_modes_fail_closed_before_owner_permit(self):
        a=type("Args",(),dict(mode="install",manifest="/tmp/no",bundle="/tmp/no",controller_sha=SHA,approved_manifest_sha256="bad"))
        with mock.patch.object(m,"root_guard",return_value=None):
            with self.assertRaisesRegex(m.Hold,"REVIEWED_MANIFEST_SHA_REQUIRED"):
                m.run_native(a)

if __name__=="__main__":unittest.main()
