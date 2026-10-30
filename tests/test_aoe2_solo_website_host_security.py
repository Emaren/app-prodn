"""Session C root-security P0 adversarial tests: all local, no HEL1 changes."""
from __future__ import annotations
import base64
import fcntl
import json
import os
from pathlib import Path
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

S=Path(__file__).resolve().parents[1]/"scripts"
sys.path.insert(0,str(S))
import aoe2_solo_website_forced_ssh as forced
import aoe2_solo_website_host_security_install as install

def pub(b):
    raw=struct.pack(">I",11)+b"ssh-ed25519"+struct.pack(">I",32)+bytes([b])*32
    return "ssh-ed25519 "+base64.b64encode(raw).decode("ascii")

def authorized(observer=None,command=None):
    observer=observer or pub(1)
    command=command or pub(2)
    return [
        'restrict,command="'+forced.FORCED+' observer" '+observer,
        'restrict,command="'+forced.FORCED+' command" '+command,
    ]

class RootSecurityP0(unittest.TestCase):
    def validate(self,keys,lines):
        def read(path,limit=262144):
            if path==forced.SSH_KEYS:return json.dumps(keys).encode()
            if path==forced.AUTHORIZED:return ("\n".join(lines)+"\n").encode()
            raise AssertionError(path)
        with patch.object(forced,"trusted_bytes",side_effect=read),\
             patch.object(forced,"verify_effective_sshd_config",return_value=True):
            return forced.verify_forced_authorized_keys()

    def test_two_different_ed25519_public_keys_have_one_forced_entry_each(self):
        self.assertTrue(self.validate({"observer":pub(1),"command":pub(2)},
                                      authorized()))

    def test_identical_ed25519_key_in_both_roles_is_p0_hold(self):
        with self.assertRaisesRegex(forced.Hold,"reuse Ed25519"):
            self.validate({"observer":pub(1),"command":pub(1)},
                          authorized(pub(1),pub(1)))

    def test_unrestricted_root_key_line_is_p0_hold(self):
        lines=authorized()+[pub(1)+" other-ssh-comment"]
        with self.assertRaisesRegex(forced.Hold,"unrestricted"):
            self.validate({"observer":pub(1),"command":pub(2)},lines)

    def test_root_key_alias_options_and_duplicates_are_p0_hold(self):
        keys={"observer":pub(1),"command":pub(2)}
        for entry in (
            'no-pty '+pub(1),
            'cert-authority '+pub(1),
            'restrict,command="/bin/sh" '+pub(2),
            'restrict,command="'+forced.FORCED+' observer" '+pub(1),
            "from=\"10.0.0.0/8\" "+pub(2),
        ):
            with self.subTest(entry=entry):
                with self.assertRaisesRegex(forced.Hold,"unrestricted"):
                    self.validate(keys,authorized()+[entry])

    def test_role_swap_is_not_accepted(self):
        with self.assertRaisesRegex(forced.Hold,"unrestricted"):
            self.validate({"observer":pub(1),"command":pub(2)},
                          list(reversed(authorized()))+
                          ['restrict,command="'+forced.FORCED+' observer" '+pub(2)])

    def test_actual_ed25519_wire_validation(self):
        self.assertEqual(forced.ed25519_identity(pub(1)),bytes([1])*32)
        with self.assertRaises(forced.Hold):
            forced.ed25519_identity(pub(1).replace("ssh-ed25519","ssh-rsa"))
        with self.assertRaises(forced.Hold):
            forced.ed25519_identity("ssh-ed25519 "+base64.b64encode(b"bogus").decode())

    def test_unallowlisted_root_shell_with_correct_enrollment_is_denied(self):
        with patch.object(forced.os,"geteuid",return_value=0),\
             patch.object(forced.socket,"gethostname",return_value=forced.HOST),\
             patch.object(forced,"verify_forced_authorized_keys",return_value=True):
            for role,request in (
                ("observer","/bin/sh"),
                ("observer","aoe2war-solo-channel abcdefghijk"),
                ("command","/usr/bin/python3 -c 'print(1)'"),
                ("command","bash -lc id"),
                ("command","aoe2war-solo-observe"),
            ):
                with self.subTest(role=role,request=request):
                    with self.assertRaises(forced.Hold):
                        forced.main(role,request)

    def test_effective_sshd_rejects_second_authorized_keys_file(self):
        base=(
          "authorizedkeysfile .ssh/authorized_keys\n"
          "authorizedkeyscommand none\n"
          "trustedusercakeys none\n"
          "pubkeyauthentication yes\n"
          "permitrootlogin prohibit-password\n"
          "authorizedprincipalsfile none\n"
        )
        conn="192.0.2.1 22000 198.51.100.2 22"
        def run(text):
            with patch.object(forced.subprocess,"run",return_value=
                    subprocess.CompletedProcess([],0,text.encode(),b"")):
                return forced.verify_effective_sshd_config(conn)
        self.assertTrue(run(base))
        for bad in (
            base.replace(".ssh/authorized_keys\n",
                         ".ssh/authorized_keys .ssh/authorized_keys2\n"),
            base.replace("authorizedkeyscommand none","authorizedkeyscommand /opt/root-keys"),
            base.replace("trustedusercakeys none","trustedusercakeys /etc/ssh/ca.pem"),
            base.replace("pubkeyauthentication yes","pubkeyauthentication no"),
        ):
            with self.subTest(bad=bad):
                with self.assertRaises(forced.Hold):
                    run(bad)
        with self.assertRaises(forced.Hold):
            forced.verify_effective_sshd_config("malformed")

    def test_installer_rejects_unrestricted_preexisting_root_key(self):
        key=pub(1)
        self.assertEqual(install.key_occurrences(["ssh-ed25519 "+key.split()[1]],key),
                         ["ssh-ed25519 "+key.split()[1]])
        keys={"observer":pub(1),"command":pub(2)}
        with self.assertRaises(install.Hold):
            install.check_key_lines((pub(1)+"\n").encode(),keys,installed=False)
        install.check_key_lines(b"ssh-ed25519 unrelated-original-key\n",
                                keys,installed=False)

    def test_original_inode_split_flock_reproduction_and_guard_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory);lock=p/"release.lock";lock.touch()
            fd1=os.open(lock,os.O_RDWR);fcntl.flock(fd1,fcntl.LOCK_EX|fcntl.LOCK_NB)
            try:
                first=os.fstat(fd1).st_ino
                lock.rename(p/"renamed")
                lock.touch()
                fd2=os.open(lock,os.O_RDWR)
                try:
                    fcntl.flock(fd2,fcntl.LOCK_EX|fcntl.LOCK_NB)
                    self.assertNotEqual(first,os.fstat(fd2).st_ino)
                finally:os.close(fd2)
            finally:os.close(fd1)
        with patch.object(install,"LOCK",p/"not-a-live-lock"):
            with self.assertRaises(OSError):
                install.lock_snapshot()
        # Host security installer never changes the original lock inode.
        self.assertNotIn("os.chown(LOCK", (S/"aoe2_solo_website_host_security_install.py").read_text())

    def test_owner_install_guard_and_atomic_rollback_policy(self):
        text=(S/"aoe2_solo_website_host_security_install.py").read_text()
        for expected in (
            'socket.gethostname()==HOST',
            'sys.stdin.isatty()',
            'fcntl.LOCK_EX|fcntl.LOCK_NB',
            'lock_snapshot()==before',
            'for directory in (CONTROL,LOCKS):',
            'atomic_write(ROOT_KEYS,saved)',
            'LOCK ANCESTORS REMAIN PROTECTED',
        ):
            self.assertIn(expected,text)

if __name__=="__main__":
    unittest.main()
