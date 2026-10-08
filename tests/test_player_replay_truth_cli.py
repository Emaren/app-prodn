import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import io
from contextlib import redirect_stdout, redirect_stderr
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('player_truth', Path(__file__).parents[1]/'scripts/player-replay-truth.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

class PlayerTruthCliTests(unittest.TestCase):
    def test_inventory_collection_mode_is_injected_and_sealed_without_authority(self):
        for inventory_only in [False, True]:
            with self.subTest(inventory_only=inventory_only), tempfile.TemporaryDirectory() as d:
                targets=Path(d)/'targets.json'
                targets.write_text(json.dumps([{'name':'Zodiac','steamId':'76561198103810510'}]))
                observed=[]
                truth=SimpleNamespace()
                def observe(mode):
                    self.assertEqual(mode,'census')
                    observed.append(truth.REMOTE_PROGRAM.read_text())
                    return {'collection':{'inventoryOnly':inventory_only},'mutations':{'production':0,'wolo':0}}
                truth.run_remote=observe
                fake_spec=SimpleNamespace(loader=SimpleNamespace(exec_module=lambda _:None))
                args=['baseline','--targets',str(targets),'--receipt-dir',str(Path(d)/'receipts')]
                if inventory_only:args.append('--inventory-only')
                output=io.StringIO()
                with patch.object(m.importlib.util,'spec_from_file_location',return_value=fake_spec), patch.object(
                    m.importlib.util,'module_from_spec',return_value=truth,
                ), redirect_stdout(output):
                    m.main(args)
                self.assertEqual(len(observed),1)
                self.assertIn('const inventoryOnly='+str(inventory_only).lower()+';',observed[0])
                self.assertIn('"steamId": "76561198103810510"',observed[0])
                self.assertNotIn('// injected exact scope',observed[0])
                receipt=json.loads(output.getvalue())
                raw=Path(receipt['path']).read_bytes();envelope=json.loads(raw)
                self.assertEqual(receipt['sha256'],hashlib.sha256(raw).hexdigest())
                self.assertEqual(envelope['observerSha256'],hashlib.sha256(observed[0].encode()).hexdigest())
                self.assertEqual(envelope['payload']['collection']['inventoryOnly'],inventory_only)
                for field in ['databaseMutated','runtimeMutated','woloMutated']:self.assertIs(envelope[field],False)

    def test_inventory_flag_rejects_evidence_and_plan_before_remote_execution(self):
        for mode in ['evidence','plan']:
            with self.subTest(mode=mode), patch.object(m.importlib.util,'spec_from_file_location') as load, redirect_stderr(io.StringIO()) as error:
                with self.assertRaises(SystemExit) as raised:m.main([mode,'--inventory-only'])
                self.assertEqual(raised.exception.code,2)
                self.assertIn('baseline projection',error.getvalue())
                load.assert_not_called()

    def test_exact_targets_reject_invented_identity_and_duplicates(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'targets.json'
            for payload in [[],[{'name':'A','steamId':'invented'}],[{'name':'A'},{'name':'a'}],[{'name':'A','uid':'bad'}]]:
                p.write_text(json.dumps(payload))
                with self.assertRaises(ValueError):m.targets_from_file(p)
            p.write_text(json.dumps([{'name':'A','uid':'u_exact'}]))
            self.assertEqual(m.targets_from_file(p),[{'name':'A','uid':'u_exact'}])
            p.write_text(json.dumps([{'name':'same name','steamId':'76561198103810510'}]))
            self.assertEqual(m.targets_from_file(p)[0]['steamId'],'76561198103810510')

    def test_immutable_receipts_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            r=m.seal({'readOnly':True},d,'baseline');p=Path(r['path'])
            self.assertEqual(hashlib.sha256(p.read_bytes()).hexdigest(),r['sha256'])
            self.assertEqual(p.stat().st_mode & 0o777,0o400)
            with self.assertRaises(FileExistsError):m.seal({'readOnly':True},d,'baseline')

    def test_evidence_binds_snapshot_hash_and_exact_case_scope(self):
        case=lambda ident,resolved,roster:dict(id=ident,replayHash=str(ident)*64,fullBattleTruth=resolved,roster={'complete':roster})
        x={'mutations':dict(production=0,parserRows=0,identityRows=0,currentRatingRows=0,wolo=0),'players':[{'identityAmbiguous':False,'cases':[case(1,False,False),case(2,True,True),case(3,True,True),case(4,True,True)]}]}
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'baseline.json';p.write_text(json.dumps(x));sha=hashlib.sha256(p.read_bytes()).hexdigest()
            r=m.evidence_targets(p,sha)
            self.assertEqual(r['ids'],[1]);self.assertEqual(r['controls'],[2,3]);self.assertEqual(r['rosterIds'],[1]);self.assertEqual(set(r['bindings']),{'1','2','3'})
            with self.assertRaises(ValueError):m.evidence_targets(p,'a'*64)
            x['players'][0]['identityAmbiguous']=True;p.write_text(json.dumps(x))
            with self.assertRaises(ValueError):m.evidence_targets(p,hashlib.sha256(p.read_bytes()).hexdigest())

    def test_observer_has_no_apply_or_result_writer(self):
        root=Path(__file__).parents[1]
        for name in ['player_replay_truth_remote.mjs','player_replay_evidence_remote.mjs']:
            text=(root/'scripts'/name).read_text()
            self.assertIn("transaction_read_only",text)
            for forbidden in ['applyTargetedReplayRosterRecovery','submitReplayResultAdjudication','$executeRaw','.gameStats.update(','.gameStats.create(','.gameStats.delete(']:self.assertNotIn(forbidden,text)

if __name__=='__main__':unittest.main()
