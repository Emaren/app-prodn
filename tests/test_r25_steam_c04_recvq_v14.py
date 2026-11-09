"""V14: exact C04 listener identity under volatile PostgreSQL receive backlog."""
import hashlib
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
V14=ROOT/'scripts/release/r25_steam_refresh_traffic_v14.py'
V13=ROOT/'scripts/release/r25_steam_refresh_traffic_v13.py'
CONTROLLER=ROOT/'scripts/release/r25_steam_masked_c04_switch_v14.py'
spec=importlib.util.spec_from_file_location('r25_steam_v14_recvq_test_source',str(V14))
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

def socket_row(port=5432,recv=0,send=200,ino=785,sk='a2f4',cg='/system.slice/postgresql.service'):
    return f'LISTEN {recv} {send} 127.0.0.1:{port} 0.0.0.0:* users:(("postgres",pid=733,fd=7)) uid:112 ino:{ino} sk:{sk} cgroup:{cg} <->'

def current(receive=0):
    return {3030:[socket_row(3030,0,511,101)],
            3032:[socket_row(3032,0,511,102)],
            5432:[socket_row(5432,receive,200,103)],
            8092:[],8093:[],8094:[],8095:[]}

class C04RecvQOnly(unittest.TestCase):
    def test_5432_normal_queue_changes_are_same_identity(self):
        original=current()
        for r in (1,2,5,10,100,200):
            with self.subTest(recv=r):
                self.assertEqual(m.c04_socket_backlog_identity_rows(original),
                                 m.c04_socket_backlog_identity_rows(current(r)))

    def test_3030_3032_queue_only_changes_are_same_identity(self):
        initial=current()
        with_queues=current()
        with_queues[3030][0]=socket_row(3030,2,511,101)
        with_queues[3032][0]=socket_row(3032,5,511,102)
        self.assertEqual(m.c04_socket_backlog_identity_rows(initial),
                         m.c04_socket_backlog_identity_rows(with_queues))

    def test_exact_critical_listener_metadata_preserved(self):
        baseline=m.c04_socket_backlog_identity_rows(current())
        for port,old,new in [
            (5432,'ino:103','ino:999'),
            (5432,'sk:a2f4','sk:abc'),
            (5432,'uid:112','uid:0'),
            (5432,'cgroup:/system.slice/postgresql.service','cgroup:/other.service'),
            (5432,'127.0.0.1:5432','0.0.0.0:5432'),
            (5432,'0.0.0.0:*','127.0.0.1:65535'),
            (5432,'LISTEN 0 200','LISTEN 0 300'),
            (3032,'ino:102','ino:105'),
            (3030,'ino:101','ino:998'),
        ]:
            with self.subTest(port=port,old=old,new=new):
                altered=current()
                altered[port][0]=altered[port][0].replace(old,new)
                self.assertNotEqual(baseline,m.c04_socket_backlog_identity_rows(altered))

    def test_added_or_removed_or_reopened_listener_not_forgiven(self):
        initial=m.c04_socket_backlog_identity_rows(current())
        for port in (3030,3032,5432):
            altered=current();altered[port]=[]
            self.assertNotEqual(initial,m.c04_socket_backlog_identity_rows(altered))
        altered=current();altered[8092]=[socket_row(8092)]
        self.assertNotEqual(initial,m.c04_socket_backlog_identity_rows(altered))
        altered=current();altered[5432].append(socket_row(5432,0,200,900))
        self.assertNotEqual(initial,m.c04_socket_backlog_identity_rows(altered))

    def test_queue_over_capacity_explicitly_denied(self):
        for bad in (-1,202,99999):
            with self.subTest(bad=bad):
                altered=current()
                altered[5432]=[socket_row(5432,bad,200)]
                with self.assertRaisesRegex(RuntimeError,'C04_'):
                    m.c04_socket_backlog_identity_rows(altered)

    def test_bad_queue_shapes_and_truncated_identity_denied(self):
        for row in ('LISTEN foo 200 127.0.0.1:5432 * ino:7 sk:4 cgroup:/x',
                    'LISTEN 0 0 127.0.0.1:5432 * ino:7 sk:4 cgroup:/x',
                    'LISTEN 0 200 127.0.0.1:5432',
                    'ESTAB 0 200 127.0.0.1:5432 * ino:7 sk:4 cgroup:/x',
                    'LISTEN 0 200 127.0.0.1:5432 * uid:112 ino:7 sk:4',
                    'LISTEN 0 200 127.0.0.1:5432 * uid:112 ino:7 cgroup:/x'):
            with self.subTest(row=row):
                altered=current();altered[5432]=[row]
                with self.assertRaisesRegex(RuntimeError,'C04_'):
                    m.c04_socket_backlog_identity_rows(altered)

    def test_scope_missing_or_added_port_denied(self):
        for extra in (False,True):
            altered=current()
            if extra:altered[1234]=[]
            else:del altered[5432]
            with self.assertRaisesRegex(RuntimeError,'C04_SOCKET_SCOPE_UNRECOGNIZED'):
                m.c04_socket_backlog_identity_rows(altered)

    def test_non_str_or_nonlist_rejected(self):
        for val in (None,[4],{'hello':'world'},0):
            a=current();a[5432]=val
            with self.assertRaisesRegex(RuntimeError,'C04_'):
                m.c04_socket_backlog_identity_rows(a)

    def test_original_v1_and_C04_V11_sources_not_modified(self):
        text=V14.read_text()
        self.assertEqual(m.C04_HELPER_SHA256,'0b56dd8dbdd8ae3fea58019df7fa6e14250030cac6d664b542b081142701b340')
        self.assertEqual(m.FIN_SNAPSHOT,'064a16dde48c64a3001621902b4ae7a028ec4975183fd4c24b8a16338c1a226c')
        self.assertIn('native_listeners = module.listeners',text)
        self.assertIn('module.listeners=c04_backlog_normalized_listeners',text)
        self.assertIn('original_factory', (ROOT/'scripts/release/r25_c04_masked_listener_guard_v11.py').read_text())
        self.assertIn('o.load_immutable_original()',text)
        self.assertIn('obj.refresh()',text)

    def test_same_exact_one_use_v13_backout_and_C04_sha_pins(self):
        ctl=CONTROLLER.read_text()
        self.assertIn("OLD = b'r25_steam_refresh_traffic_v13.py'",ctl)
        self.assertIn("NEW = b'r25_steam_refresh_traffic_v14.py'",ctl)
        self.assertIn("OLD_UNIT_SHA = 'a6795c7c840234fd9c590c17bd590bdeb5a8cbab244adb7989aaa79e4faf33f6'",ctl)
        self.assertIn("NEW_UNIT_SHA = '17d640fde690e4e780dfd7370bd9d99122ccde7d567c0a043c8060739e6181f4'",ctl)
        self.assertIn("MAIN_SHA = '"+hashlib.sha256(V14.read_bytes()).hexdigest()+"'",ctl)
        self.assertIn("HELPER_SHA = '0b56dd8dbdd8ae3fea58019df7fa6e14250030cac6d664b542b081142701b340'",ctl)
        self.assertIn('stage_verified_digest_only_manifest()',ctl)
        self.assertIn('PASS_ROLLBACK_ORIGINAL_V13_SOURCE_RESTORED_UNDER_C04_HOLD',ctl)

    def test_no_finance_reenabling(self):
        for path in (V14,CONTROLLER):
            text=path.read_text()
            for bad in ('systemctl unmask','ALTER ROLE','GRANT ALL','CAP_SYS_ADMIN','http://127.0.0.1:8092','http://127.0.0.1:8093'):
                self.assertNotIn(bad,text)

if __name__=='__main__':unittest.main()
