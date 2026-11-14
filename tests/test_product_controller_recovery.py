"""Exercise reviewed V3 failure boundaries in isolated files, never host services."""
import ast
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import tarfile
import tempfile
import time
import unittest
from unittest.mock import Mock

SOURCE = Path(__file__).resolve().parents[1] / 'docs/release/artifacts/aoe2war_product_release_controller_v3.py'
NAMES = {'hold', 'sha_bytes', 'sha_file', 'fsync_dir', 'atomic', 'json_save', 'json_get',
         'unit_guard', 'inspect_archive', 'stage', 'state_need', 'expected_old_factory_http', 'switch'}
TREE = ast.parse(SOURCE.read_text())
BLOCK = ast.fix_missing_locations(ast.Module(body=[n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name in NAMES], type_ignores=[]))


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.old = self.base / 'old'
        self.new = self.base / 'new'
        self.old.mkdir()
        (self.old / '.next').mkdir()
        (self.old / '.aoe2war-source-sha').write_text('a' * 40)
        (self.old / '.next/BUILD_ID').write_text('OLD_BUILD_123')
        self.journal = self.base / 'journal'
        self.journal.mkdir()
        self.original = self.journal / 'original-web-unit.service'
        self.candidate = self.journal / 'factory-web-unit.service'
        self.unit = self.base / 'active.service'
        self.original.write_bytes(b'EXACT_OLD_UNIT')
        self.candidate.write_bytes(b'EXACT_NEW_UNIT')
        self.unit.write_bytes(self.original.read_bytes())
        self.precheck = self.journal / 'preflight.json'
        self.precheck.write_text(json.dumps({'old_factory_http': 200, 'protected_pids': {'guarded': '7'}}))
        self.state = self.journal / 'state.json'
        self.ops = []
        self.g = dict(Path=Path, PurePosixPath=PurePosixPath, os=os, stat=stat, json=json,
            dt=dt, hashlib=hashlib, tarfile=tarfile, shutil=shutil, time=Mock(sleep=Mock()),
            subprocess=Mock(run=Mock(return_value=Mock(returncode=0))), re=__import__('re'),
            SOURCE='b'*40, BUILD='NEW_BUILD_123', VERSION='20261113-test-version',
            PREVIOUS_SOURCE='a'*40, PREVIOUS_BUILD='OLD_BUILD_123', PREVIOUS_ROOT=str(self.old),
            TARGET=self.new, TEMP=self.base/'partial', JOURNAL=self.journal,
            STATE=self.state, PRECHECK=self.precheck, APP_UNIT=self.unit,
            ORIGINAL=self.original, CANDIDATE=self.candidate, SERVICE='fixture-web',
            ARCHIVE=self.base/'runtime.tar.gz', ARCHIVE_BYTES=0, ARCHIVE_SHA='0'*64,
            UNIT_ORIGINAL_SHA=hashlib.sha256(self.unit.read_bytes()).hexdigest(),
            CONFIG={'independent_proof_sha256': '0'*64}, EXPECTED_RUNTIME_MEMBERS=3,
            guard_finance=Mock(), guard_web=Mock(), protected=Mock(return_value={'guarded':'7'}),
            hold_protected=Mock(), property=lambda unit, field: str(self.old) if field=='WorkingDirectory' else '42',
            url_status=lambda port, path: 200, run=self.run_command,
            create_journal=Mock(), target_health=Mock(return_value=True))
        exec(compile(BLOCK, str(SOURCE), 'exec'), self.g)

    def run_command(self, *args, **kwargs):
        self.ops.append(args)
        return ''

    def state_at(self, phase='prepared', source=None, build=None):
        self.state.write_text(json.dumps({'phase':phase, 'source':source or 'b'*40, 'build':build or 'NEW_BUILD_123'}))
        self.new.mkdir(exist_ok=True)
        (self.new/'.next').mkdir(exist_ok=True)
        (self.new/'.next/BUILD_ID').write_text('NEW_BUILD_123')

    def test_insufficient_disk_holds_before_journal_or_service_mutation(self):
        from unittest.mock import patch
        self.g['inspect_archive']=Mock()
        self.g['unit_guard']=Mock()
        proof=self.g['ARCHIVE'].parent/'b-linux-independent-review-v2.json'
        proof.write_bytes(b'isolated independent proof fixture')
        self.g['CONFIG']['independent_proof_sha256']=hashlib.sha256(proof.read_bytes()).hexdigest()
        with patch.object(shutil,'disk_usage',return_value=Mock(free=6*1024**3-1)):
            with self.assertRaisesRegex(RuntimeError,'DISK_HEADROOM'):
                self.g['stage']()
        self.g['create_journal'].assert_not_called()
        self.assertFalse(self.state.exists())
        self.assertEqual(self.unit.read_bytes(),b'EXACT_OLD_UNIT')
        self.assertEqual(self.ops,[])

    def test_partial_extraction_holds_without_deleting_or_stopping(self):
        self.g['TEMP'].mkdir()
        evidence=self.g['TEMP']/'partial-file'
        evidence.write_bytes(b'preserve investigation evidence')
        with self.assertRaisesRegex(RuntimeError, 'PARTIAL_EXTRACT_EXISTS'):
            self.g['stage']()
        self.assertEqual(evidence.read_bytes(), b'preserve investigation evidence')
        self.assertEqual(self.ops, [])
        self.g['create_journal'].assert_not_called()

    def test_existing_runtime_is_never_reused_by_new_stage(self):
        self.new.mkdir()
        with self.assertRaisesRegex(RuntimeError, 'TARGET_EXISTS'):
            self.g['stage']()
        self.assertEqual(self.ops, [])

    def test_invalid_archive_sha_preserves_all_state(self):
        archive=self.g['ARCHIVE']
        archive.write_bytes(b'wrong artifact')
        self.g['ARCHIVE_BYTES']=archive.stat().st_size
        # Fixture file owner differs from HEL1; exercise SHA after owner predicate.
        original_lstat=Path.lstat
        from unittest.mock import patch
        current=archive.lstat()
        fields=list(current); fields[4]=1000
        with patch.object(Path, 'lstat', lambda p: os.stat_result(fields) if p==archive else original_lstat(p)):
            with self.assertRaisesRegex(RuntimeError, 'ARCHIVE_SHA_OR_SIZE'):
                self.g['inspect_archive']()
        self.assertFalse(self.state.exists())
        self.assertEqual(self.ops, [])
        self.assertEqual(archive.read_bytes(), b'wrong artifact')

    def test_failed_activation_restores_exact_old_unit(self):
        self.state_at()
        self.g['target_health']=lambda target, pre: target=='old'
        with self.assertRaisesRegex(RuntimeError, 'TARGET_HEALTH_NOT_READY'):
            self.g['switch']('new','live',200)
        self.assertEqual(self.unit.read_bytes(), b'EXACT_OLD_UNIT')
        self.assertEqual(json.loads(self.state.read_text())['phase'], 'auto_rolled_back')
        self.assertEqual(sum(op[:2]==('systemctl','stop') for op in self.ops), 2)

    def test_interruption_is_recorded_and_not_replayed_as_prepared(self):
        self.state_at()
        def interrupt(*args, **kwargs):
            raise KeyboardInterrupt('bounded fixture interruption')
        self.g['run']=interrupt
        with self.assertRaises(KeyboardInterrupt):
            self.g['switch']('new','live',200)
        self.assertEqual(json.loads(self.state.read_text())['phase'], 'switching_live')
        self.assertEqual(self.unit.read_bytes(), b'EXACT_OLD_UNIT')
        with self.assertRaisesRegex(RuntimeError, 'JOURNAL_PHASE_switching_live'):
            self.g['state_need'](('prepared',))

    def test_prepared_state_survives_new_process_namespace(self):
        self.state_at()
        namespace=dict(self.g)
        exec(compile(BLOCK, str(SOURCE), 'exec'), namespace)
        self.assertEqual(namespace['state_need'](('prepared',))['phase'], 'prepared')

    def test_wrong_source_never_resumes(self):
        self.state_at(source='c'*40)
        with self.assertRaisesRegex(RuntimeError, 'JOURNAL_IDENTITY'):
            self.g['state_need'](('prepared',))

    def test_wrong_build_never_resumes(self):
        self.state_at()
        (self.new/'.next/BUILD_ID').write_text('FOREIGN_BUILD')
        with self.assertRaisesRegex(RuntimeError, 'TARGET_BUILD_DRIFT'):
            self.g['state_need'](('prepared',))

    def test_atomic_write_collision_preserves_both_evidence_files(self):
        target=self.base/'receipt.json'
        target.write_bytes(b'original')
        pending=target.with_name('.receipt.json.factory-v1.tmp')
        pending.write_bytes(b'interrupted write')
        with self.assertRaisesRegex(RuntimeError, 'TEMP_COLLISION'):
            self.g['atomic'](target,b'new')
        self.assertEqual(target.read_bytes(), b'original')
        self.assertEqual(pending.read_bytes(), b'interrupted write')

    def test_failed_rollback_keeps_failure_state_without_inventing_live(self):
        self.state_at('live')
        self.unit.write_bytes(b'EXACT_NEW_UNIT')
        self.g['target_health']=lambda target,pre: False
        with self.assertRaisesRegex(RuntimeError, 'TARGET_HEALTH_NOT_READY'):
            self.g['switch']('old','rolled_back',200)
        self.assertEqual(json.loads(self.state.read_text())['phase'], 'switching_rolled_back')
        self.assertEqual(self.unit.read_bytes(), b'EXACT_OLD_UNIT')


if __name__ == '__main__':
    unittest.main(verbosity=2)



class ProtectedGuardTests(unittest.TestCase):
    def setUp(self):
        names={'hold','guard_finance','guard_web','protected','hold_protected'}
        block=ast.fix_missing_locations(ast.Module(
            body=[n for n in TREE.body if isinstance(n,ast.FunctionDef) and n.name in names],
            type_ignores=[]))
        self.pid_values={
            'aoe2hdbets-web.service':'17',
            'r25-c03-emergency-3033.service':'18',
            'kingdom-traders-paper.service':'19',
            'wolochaind-mainnet.service':'20',
        }
        self.web={
            'User':'aoe2war-web-prod',
            'EnvironmentFiles':'/etc/aoe2war/web-prod-v1/runtime.env (ignore_errors=no)',
            'MemoryMax':'3355443200','ActiveState':'active',
        }
        self.sockets=''
        self.mask='masked'
        self.bets_status=503
        def execute(arguments,**kwargs):
            return Mock(returncode=0,stdout=self.sockets if arguments[0]=='ss' else self.mask+'\n')
        def field(unit,name):
            return self.pid_values[unit] if name=='MainPID' else self.web[name]
        def status(port,path):
            return self.bets_status if path=='/api/bets' else 401 if path=='/api/auth/session' else 200
        self.g={'subprocess':Mock(run=Mock(side_effect=execute)),
                'FIN_MASKS':('fixture-quarantine.service','fixture-quarantine.timer'),
                'SERVICE':'fixture-web','property':field,'url_status':status}
        exec(compile(block,str(SOURCE),'exec'),self.g)

    def test_each_open_financial_port_fails_closed(self):
        for port in (8092,8093,8094,8095):
            with self.subTest(port=port):
                self.sockets=f'LISTEN 0 128 127.0.0.1:{port} 0.0.0.0:*'
                with self.assertRaisesRegex(RuntimeError,'FINANCIAL_PORT_OPEN'):
                    self.g['guard_finance']()

    def test_missing_financial_mask_is_not_treated_as_quarantine(self):
        self.mask='disabled'
        with self.assertRaisesRegex(RuntimeError,'FINANCIAL_MASK_MISSING'):
            self.g['guard_finance']()

    def test_any_financial_http_status_other_than_hold_is_rejected(self):
        for response in (200,401,403,404,500,None):
            with self.subTest(response=response):
                self.bets_status=response
                with self.assertRaisesRegex(RuntimeError,'FINANCIAL_API_DENIAL'):
                    self.g['guard_web']()

    def test_changed_protected_pid_requires_hold_without_service_commands(self):
        before=self.g['protected']()
        self.pid_values['wolochaind-mainnet.service']='21'
        with self.assertRaisesRegex(RuntimeError,'PROTECTED_SERVICE_PID_CHANGED'):
            self.g['hold_protected'](before)
        self.g['subprocess'].run.assert_not_called()
