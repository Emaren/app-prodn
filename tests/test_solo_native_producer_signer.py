"""R17 source tests; ephemeral crypto generated in disposable CI only."""
import base64
from datetime import datetime,timedelta,timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

P=Path(__file__).resolve().parents[1]/"scripts"/"aoe2_solo_website_producer_signer.py"
spec=importlib.util.spec_from_file_location("r17_signer",P)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
AT=datetime(2026,10,31,1,20,tzinfo=timezone.utc)
SAFE="f"*40  # test fixture, NOT approved for production
def when(t):
    return t.isoformat(timespec="seconds").replace("+00:00","Z")

def generate(args):
    subprocess.run(["/usr/bin/openssl",*args],check=True,capture_output=True)

class R17SignerTests(unittest.TestCase):
    def authorities(self):
        return {name:{"uid":10001+i,"public_spki_sha256":f"{i+1:064x}",
                      "failure_domain_id":f"independent-domain-{i}",
                      "origin_host":f"producer-{i}"} for i,name in enumerate(m.ROLES)}

    def manifest(self,role="finance"):
        authorities=self.authorities()
        return {"schema":"aoe2war.solo.producer-enrollment.v1","role":role,
                "uid":authorities[role]["uid"],"origin_host":authorities[role]["origin_host"],
                "failure_domain_id":authorities[role]["failure_domain_id"],
                "controller_sha":"a58e2416415665e2334ce884cebc2c3f64ce75b5",
                "candidate_sha":SAFE,
                "owner_public_key_path":"/root/approved-owner.pem",
                "producer_public_key_path":"/root/approved-role.pem",
                "private_key_path":"/home/producer/secret.pem",
                "public_spki_sha256":authorities[role]["public_spki_sha256"],
                "collector_path":"/usr/local/libexec/aoe2war/pinned-b-finance",
                "collector_sha256":"8"*64,
                "output_dir":"/home/producer/signed-outbox",
                "authorities":authorities}

    def preissue(self,issued=AT):
        reserved=issued-timedelta(seconds=25)
        reservation={"schema":1,"policy":m.ROOT_PREISSUE_POLICY,
                     "status":"ROOT_PREISSUED_NOT_AUTHORIZED",
                     "phase":"PRE_STAGE","candidate_sha":SAFE,
                     "attempt_id":"a"*64,"reserved_at":when(reserved),
                     "expires_at":when(reserved+timedelta(minutes=10)),
                     "financial_release_authorized":False}
        return {"status":reservation["status"],
                "candidate_sha":SAFE,"phase":"PRE_STAGE","attempt_id":"a"*64,
                "reserved_at":reservation["reserved_at"],
                "expires_at":reservation["expires_at"],
                "preissue_sha256":m.digest(m.canonical(reservation)),
                "owner_authorized":False,"financial_release_authorized":False}

    def intent(self,issued=AT):
        return {"schema":"aoe2war.solo.producer-intent.v1","payload":{
            "candidate_sha":SAFE,"controller_sha":"a58e2416415665e2334ce884cebc2c3f64ce75b5",
            "attempt_id":"a"*64,"phase":"PRE_STAGE","host":m.HOST,
            "issued_at":when(issued),"expires_at":when(issued+timedelta(seconds=60)),
            "preissue_sha256":self.preissue(issued)["preissue_sha256"],
            "finance_authorized":False,"release_authorized":False},"signature_base64":"to_sign"}

    def crypto(self,folder):
        rsa=folder/"owner-private.pem";pub=folder/"owner-pub.pem"
        generate(["genpkey","-algorithm","RSA","-pkeyopt","rsa_keygen_bits:2048","-out",str(rsa)])
        generate(["pkey","-in",str(rsa),"-pubout","-out",str(pub)])
        ed=folder/"role-private.pem";ep=folder/"role-public.pem"
        generate(["genpkey","-algorithm","ED25519","-out",str(ed)])
        generate(["pkey","-in",str(ed),"-pubout","-out",str(ep)])
        return rsa,pub,ed,ep

    def sign_intent(self,folder,rsa,intent):
        message=folder/"intent-message";signature=folder/"intent-sig"
        message.write_bytes(m.INTENT_DOMAIN+m.canonical(intent["payload"]))
        generate(["dgst","-sha256","-sign",str(rsa),"-out",str(signature),str(message)])
        intent["signature_base64"]=base64.b64encode(signature.read_bytes()).decode()
        return intent

    def test_six_roles_have_distinct_uid_origin_and_spki(self):
        a=self.manifest()
        self.assertTrue(m.validate_manifest(a,"finance",a["uid"],a["origin_host"]))

    def test_shared_private_key_identity_denied(self):
        a=self.manifest()
        a["authorities"]["source"]["public_spki_sha256"]=a["authorities"]["finance"]["public_spki_sha256"]
        with self.assertRaisesRegex(m.Hold,"SHARED_UID_KEY_OR_FAILURE_DOMAIN"):
            m.validate_manifest(a,"finance",a["uid"],a["origin_host"])

    def test_same_failure_domain_denied(self):
        a=self.manifest()
        a["authorities"]["doctor"]["failure_domain_id"]=a["authorities"]["finance"]["failure_domain_id"]
        with self.assertRaisesRegex(m.Hold,"SHARED_UID_KEY_OR_FAILURE_DOMAIN"):
            m.validate_manifest(a,"finance",a["uid"],a["origin_host"])

    def test_wrong_uid_source_or_host_denied(self):
        a=self.manifest()
        for data,role,uid,host in ((a,"finance",9999,a["origin_host"]),
                                   (a,"finance",a["uid"],"random-host")):
            with self.assertRaisesRegex(m.Hold,"NOT_ENROLLED"):
                m.validate_manifest(data,role,uid,host)
        a["candidate_sha"]="b46a51f1592c9f296839924ae55e722618b10d35"
        with self.assertRaisesRegex(m.Hold,"NOT_ENROLLED"):
            m.validate_manifest(a,"finance",a["uid"],a["origin_host"])

    def test_successor_identity_pinned_in_enrollment_not_stale_website(self):
        a=self.manifest()
        self.assertEqual(a["candidate_sha"],SAFE)
        self.assertNotEqual(SAFE,"a9525f46302edff88ed073743a7dfaed08be9e3e")
        self.assertTrue(m.validate_manifest(a,"finance",a["uid"],a["origin_host"]))

    def test_preissue_journal_exact_digest_and_owner_intent_binding(self):
        request=self.intent()
        self.assertTrue(m.require_f_original_preissue(
            self.preissue(),request["payload"],AT))
        preissue=self.preissue()
        preissue["attempt_id"]="b"*64
        with self.assertRaisesRegex(m.Hold,"PREISSUE_SCOPE_OR_OWNER_HASH_MISMATCH"):
            m.require_f_original_preissue(preissue,request["payload"],AT)

    def test_preissue_cannot_cross_successor_source(self):
        p=self.intent()["payload"]
        preissue=self.preissue()
        p["candidate_sha"]="e"*40
        with self.assertRaisesRegex(m.Hold,"PREISSUE_SCOPE_OR_OWNER_HASH_MISMATCH"):
            m.require_f_original_preissue(preissue,p,AT)

    def test_preissue_hash_rejects_modified_root_response(self):
        p=self.intent()["payload"]
        preissue=self.preissue()
        preissue["reserved_at"]=when(AT-timedelta(seconds=24))
        preissue["expires_at"]=when(AT+timedelta(minutes=9,seconds=36))
        with self.assertRaisesRegex(m.Hold,"ROOT_PREISSUE_RESERVATION_HASH_MISMATCH"):
            m.require_f_original_preissue(preissue,p,AT)

    def test_preissue_expiry_cannot_be_extended(self):
        p=self.intent()["payload"]
        preissue=self.preissue()
        preissue["expires_at"]=when(AT+timedelta(minutes=11))
        with self.assertRaisesRegex(m.Hold,"ROOT_PREISSUE_EXPIRED_OR_WRONG_EPOCH"):
            m.require_f_original_preissue(preissue,p,AT)

    def test_preissue_not_owner_release_authorization(self):
        p=self.intent()["payload"]
        preissue=self.preissue()
        preissue["owner_authorized"]=True
        with self.assertRaisesRegex(m.Hold,"ORIGINAL_FD200_PREISSUE_RESPONSE_REQUIRED"):
            m.require_f_original_preissue(preissue,p,AT)

    def test_real_owner_signed_preissue_digest_not_replayable(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);rsa,pub,_,_=self.crypto(folder)
            request=self.sign_intent(folder,rsa,self.intent())
            self.assertEqual(m.signed_intent(
                request,pub,self.manifest(),AT,self.preissue())["attempt_id"],"a"*64)
            modified=self.preissue()
            modified["preissue_sha256"]="0"*64
            with self.assertRaisesRegex(m.Hold,"PREISSUE_SCOPE_OR_OWNER_HASH_MISMATCH"):
                m.signed_intent(request,pub,self.manifest(),AT,modified)

    def test_rsa_signed_owner_preintent_real_crypto(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);rsa,pub,ed,ep=self.crypto(folder)
            request=self.sign_intent(folder,rsa,self.intent())
            self.assertEqual(m.signed_intent(request,pub,self.manifest(),AT,self.preissue())["attempt_id"],"a"*64)

    def test_owner_intent_wrong_source_cannot_be_resigned_into_acceptance(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);rsa,pub,_,_=self.crypto(folder)
            request=self.intent()
            request["payload"]["candidate_sha"]="b46a51f1592c9f296839924ae55e722618b10d35"
            request=self.sign_intent(folder,rsa,request)
            with self.assertRaisesRegex(m.Hold,"FOREIGN_OR_UNSAFE_OWNER_INTENT"):
                m.signed_intent(request,pub,self.manifest(),AT,self.preissue())

    def test_owner_intent_signature_tamper_denied(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);rsa,pub,_,_=self.crypto(folder)
            request=self.sign_intent(folder,rsa,self.intent())
            request["payload"]["attempt_id"]="b"*64
            with self.assertRaisesRegex(m.Hold,"CRYPTO_VERIFY_FAILED"):
                m.signed_intent(request,pub,self.manifest(),AT,self.preissue())

    def test_owner_phase_consent_cannot_cross_over_from_preintent(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);rsa,pub,_,_=self.crypto(folder)
            request=self.sign_intent(folder,rsa,self.intent())
            message=folder/"wrong-domain";sig=folder/"sig"
            message.write_bytes(b"AOE2WAR.SOLO_OWNER.WEBSITE.ADMISSION.V1\n"+
                                m.canonical(request["payload"]))
            sig.write_bytes(base64.b64decode(request["signature_base64"]))
            proc=subprocess.run(["/usr/bin/openssl","dgst","-sha256","-verify",str(pub),
                                 "-signature",str(sig),str(message)],capture_output=True)
            self.assertNotEqual(proc.returncode,0)

    def test_owner_intent_expiry_and_future_denied(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);rsa,pub,_,_=self.crypto(folder)
            request=self.sign_intent(folder,rsa,self.intent(AT-timedelta(seconds=91)))
            with self.assertRaisesRegex(m.Hold,"INTENT_EXPIRED_OR_FUTURE"):
                m.signed_intent(request,pub,self.manifest(),AT,self.preissue())
            request=self.sign_intent(folder,rsa,self.intent(AT+timedelta(seconds=2)))
            with self.assertRaisesRegex(m.Hold,"INTENT_EXPIRED_OR_FUTURE"):
                m.signed_intent(request,pub,self.manifest(),AT,self.preissue())

    def test_owner_intent_no_finance_or_release_permission(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);rsa,pub,_,_=self.crypto(folder)
            request=self.intent();request["payload"]["release_authorized"]=True
            request=self.sign_intent(folder,rsa,request)
            with self.assertRaisesRegex(m.Hold,"FOREIGN_OR_UNSAFE_OWNER_INTENT"):
                m.signed_intent(request,pub,self.manifest(),AT,self.preissue())

    def test_real_ephemeral_ed25519_producer_signature_matches_f_domain(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);rsa,pub,ed,ep=self.crypto(folder)
            manifest=self.manifest()
            manifest["private_key_path"]=str(ed)
            manifest["producer_public_key_path"]=str(ep)
            request=self.intent()
            report=m.make_signed_receipt(manifest,request,{"real":{"source":"stub-test"}},now=AT)
            signed=report["receipt"]
            message=folder/"message";sig=folder/"sig"
            message.write_bytes(m.RECEIPT_DOMAIN+m.canonical(signed["payload"]))
            sig.write_bytes(base64.b64decode(signed["signature_base64"]))
            result=subprocess.run(["/usr/bin/openssl","pkeyutl","-verify","-pubin",
                "-inkey",str(ep),"-rawin","-in",str(message),"-sigfile",str(sig)],
                capture_output=True)
            self.assertEqual(result.returncode,0,result.stderr.decode())
            self.assertEqual(report["class"],"finance")
            self.assertNotIn("private_key",m.canonical(report).decode())

    def test_producer_sig_cross_role_replay_denied_by_digest(self):
        manifest=self.manifest()
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);_,_,ed,ep=self.crypto(folder)
            manifest["private_key_path"]=str(ed)
            manifest["producer_public_key_path"]=str(ep)
            report=m.make_signed_receipt(manifest,self.intent(),{"value":11})
            report["receipt"]["payload"]["producer"]="source"
            message=folder/"wrong";sig=folder/"sig"
            message.write_bytes(m.RECEIPT_DOMAIN+m.canonical(report["receipt"]["payload"]))
            sig.write_bytes(base64.b64decode(report["receipt"]["signature_base64"]))
            result=subprocess.run(["/usr/bin/openssl","pkeyutl","-verify","-pubin",
                "-inkey",str(ep),"-rawin","-in",str(message),"-sigfile",str(sig)],
                capture_output=True)
            self.assertNotEqual(result.returncode,0)

    def test_observation_epoch_bound_is_not_fabricated(self):
        p=self.intent()["payload"]
        with tempfile.TemporaryDirectory() as td:
            collector=Path(td)/"collector"
            collector.write_bytes(b"reviewed")
            def fake_run(*args,**kwargs):
                class Result:
                    returncode=0
                    stdout=m.canonical({"schema":"aoe2war.solo.producer-measurement.v1",
                        "class":"finance","collected_at":when(AT+timedelta(seconds=20)),
                        "section":{"x":1},"collector_sha256":m.digest(b"reviewed")})
                return Result()
            with mock.patch.object(m.subprocess,"run",side_effect=fake_run), \
                 mock.patch.object(m,"checked_file",return_value=b"reviewed"):
                with self.assertRaisesRegex(m.Hold,"MEASUREMENT_TIME_OUTSIDE_SIGNED_EPOCH"):
                    m.measure(collector,"finance",p,AT,AT+timedelta(seconds=21))

    def test_missing_collector_or_bad_status_holds(self):
        p=self.intent()["payload"]
        with mock.patch.object(m.subprocess,"run",side_effect=OSError("missing")):
            with self.assertRaisesRegex(m.Hold,"REVIEWED_COLLECTOR_UNAVAILABLE"):
                m.measure(Path("/unavailable"),"finance",p,AT,AT)

    def test_replay_output_oexcl_denied(self):
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);os.chmod(folder,0o700)
            destination=folder/"receipt.json"
            m.write_once(destination,b"original\n",os.geteuid())
            with self.assertRaises(FileExistsError):
                m.write_once(destination,b"replacement\n",os.geteuid())
            self.assertEqual(destination.read_bytes(),b"original\n")

    def test_duplicate_json_keys_denied(self):
        with self.assertRaisesRegex(m.Hold,"DUPLICATE_JSON_PROPERTY"):
            m.parse(b'{"phase":"a","phase":"b"}')

    def test_r19_enrollment_spool_checked_without_writing(self):
        with tempfile.TemporaryDirectory() as td:
            directory=Path(td)
            os.chmod(directory,0o700)
            self.assertTrue(m.verify_spool(directory,os.geteuid()))
            self.assertEqual(list(directory.iterdir()),[])
            os.chmod(directory,0o755)
            with self.assertRaisesRegex(m.Hold,"UNPROTECTED_PRODUCER_SPOOL"):
                m.verify_spool(directory,os.geteuid())
            os.chmod(directory,0o700)
            symlink=directory.parent/(directory.name+"-symlink")
            symlink.symlink_to(directory,target_is_directory=True)
            try:
                with self.assertRaisesRegex(m.Hold,"UNPROTECTED_PRODUCER_SPOOL"):
                    m.verify_spool(symlink,os.geteuid())
            finally:
                symlink.unlink()

    def test_r19_local_preflight_no_owner_intent_no_receipt(self):
        manifest=self.manifest()
        with mock.patch.object(m.os,"geteuid",return_value=manifest["uid"]), \
             mock.patch.object(m.os,"environ",{}), \
             mock.patch.object(m.sys,"platform","linux"), \
             mock.patch.object(m.socket,"gethostname",return_value=manifest["origin_host"]), \
             mock.patch.object(m,"checked_file",return_value=m.canonical(manifest)), \
             mock.patch.object(m,"verify_identity",return_value=True), \
             mock.patch.object(m,"verify_spool",return_value=True) as spool, \
             mock.patch.object(m,"signed_intent") as intent, \
             mock.patch.object(m,"measure") as collect, \
             mock.patch.object(m,"make_signed_receipt") as sign, \
             mock.patch.object(m,"write_once") as write, \
             mock.patch("builtins.print") as out:
            self.assertEqual(m.main(["enrollment-check","--role","finance",
                "--expect-candidate-sha",SAFE,
                "--expect-controller-sha",manifest["controller_sha"]]),0)
            report=json.loads(out.call_args.args[0])
            self.assertEqual(report["status"],"LOCAL_ENROLLMENT_CHECKED_UNADMITTED")
            self.assertEqual(report["candidate_sha"],SAFE)
            self.assertEqual(report["controller_sha"],manifest["controller_sha"])
            self.assertFalse(report["receipt_issued"])
            self.assertFalse(report["financial_authorized"])
            self.assertFalse(report["release_authorized"])
            spool.assert_called_once()
            intent.assert_not_called()
            collect.assert_not_called()
            sign.assert_not_called()
            write.assert_not_called()

    def test_r19_preflight_rejects_authority_inputs_and_sign_without_preissue(self):
        manifest=self.manifest()
        with mock.patch.object(m.os,"geteuid",return_value=manifest["uid"]), \
             mock.patch.object(m.os,"environ",{}), \
             mock.patch.object(m.sys,"platform","linux"), \
             mock.patch.object(m.socket,"gethostname",return_value=manifest["origin_host"]), \
             mock.patch.object(m,"checked_file",return_value=m.canonical(manifest)), \
             mock.patch.object(m,"verify_identity",return_value=True), \
             mock.patch.object(m,"verify_spool",return_value=True), \
             mock.patch.object(m,"measure") as collect, \
             mock.patch.object(m,"make_signed_receipt") as sign, \
             mock.patch("builtins.print"):
            self.assertEqual(m.main(["enrollment-check","--role","finance",
                                     "--intent","/must-not-be-read",
                                     "--expect-candidate-sha",SAFE,
                                     "--expect-controller-sha",manifest["controller_sha"]]),2)
            self.assertEqual(m.main(["sign","--role","finance"]),2)
            self.assertEqual(m.main(["inspect","--role","finance"]),2)
            collect.assert_not_called()
            sign.assert_not_called()

    def test_r19_local_preflight_rejects_stale_or_missing_f_source_pins(self):
        manifest=self.manifest()
        with mock.patch.object(m.os,"geteuid",return_value=manifest["uid"]), \
             mock.patch.object(m.os,"environ",{}), \
             mock.patch.object(m.sys,"platform","linux"), \
             mock.patch.object(m.socket,"gethostname",return_value=manifest["origin_host"]), \
             mock.patch.object(m,"checked_file",return_value=m.canonical(manifest)), \
             mock.patch.object(m,"verify_identity",return_value=True), \
             mock.patch.object(m,"verify_spool") as spool, \
             mock.patch("builtins.print"):
            self.assertEqual(m.main(["enrollment-check","--role","finance"]),2)
            self.assertEqual(m.main(["enrollment-check","--role","finance",
                "--expect-candidate-sha","a9525f46302edff88ed073743a7dfaed08be9e3e",
                "--expect-controller-sha",manifest["controller_sha"]]),2)
            self.assertEqual(m.main(["enrollment-check","--role","finance",
                "--expect-candidate-sha",SAFE,
                "--expect-controller-sha","a"*40]),2)
            spool.assert_not_called()

    def test_r19_local_preflight_wrong_origin_denied(self):
        manifest=self.manifest()
        with mock.patch.object(m.os,"geteuid",return_value=manifest["uid"]), \
             mock.patch.object(m.os,"environ",{}), \
             mock.patch.object(m.sys,"platform","linux"), \
             mock.patch.object(m.socket,"gethostname",return_value="unapproved-host"), \
             mock.patch.object(m,"checked_file",return_value=m.canonical(manifest)), \
             mock.patch.object(m,"verify_identity") as proof, \
             mock.patch("builtins.print"):
            self.assertEqual(m.main(["enrollment-check","--role","finance"]),2)
            proof.assert_not_called()

    def test_main_refuses_root_or_unenrolled_machine(self):
        with mock.patch.object(m.os,"geteuid",return_value=0):
            self.assertEqual(m.main(["inspect","--role","finance",
                                     "--intent","/not/needed","--preissue","/not/needed"]),2)

if __name__=="__main__":
    unittest.main()
