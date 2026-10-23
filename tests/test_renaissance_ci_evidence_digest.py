import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('dig',HERE.parent/'scripts/renaissance_ci_evidence_digest.py')
dig=importlib.util.module_from_spec(spec)
spec.loader.exec_module(dig)
SHA='a'*40
BUILD='abcDEF_123456'


def sample(page, bad=False):
    core={'brain':{'status':'PASS','sourceSha':SHA,'emittedBuildId':BUILD,'productionAttested':False,
                   'realApi':[{'viewport':'desktop','checks':{'real':True}}],
                   'controlledFixtures':[{'name':'race','passed':not bad,'indexRequests':4 if bad else 3}]},
          'intelligence':{'status':'FAIL' if bad else 'PASS','source_sha':SHA,'build_id':BUILD,
                          'cases':[{'mode':'fresh','viewport_width':390,'checks':{'recovery':True,'no_write':not bad},
                                    'pass':not bad,'requests':{'blocked_nonread_paths':([{'method':'POST','path':'/api/speed/sample'}] if bad else [])}}]},
          'tests':{'status':'PASS_INSPECTOR_ONLY','source_sha':SHA,'build_id':BUILD,
                   'passed':0 if bad else 1,'checks':[{'name':'whole_page','state':'FAIL' if bad else 'PASS'}],
                   'shared_claim_blocker':{'phone':bad,'desktop':False}}}
    return core[page]

class Tests(unittest.TestCase):
    def use(self,page,obj):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        base=Path(self.tmp.name)
        (base/'BUILD_ID').write_text(BUILD+'\n')
        (base/dig.FILES[page]).write_text(json.dumps(obj))
        return base
    def test_passes_candidate_only_no_points(self):
        for page in dig.FILES:
            with self.subTest(page=page):
                r=dig.analyze(page,self.use(page,sample(page)),SHA)
                self.assertTrue(r['accepted_candidate_test'])
                self.assertIsNone(r['quality_score'])
                self.assertFalse(r['production_attested'])
    def test_real_failures_never_get_waived(self):
        for page in dig.FILES:
            with self.subTest(page=page):
                r=dig.analyze(page,self.use(page,sample(page,True)),SHA)
                self.assertFalse(r['accepted_candidate_test'])
                self.assertTrue(r['failed_evidence'])
    def test_blocked_speed_post_stays_visible(self):
        r=dig.analyze('intelligence',self.use('intelligence',sample('intelligence',True)),SHA)
        self.assertEqual(r['blocked_attempts_by_method_path'],{'POST /api/speed/sample':1})
    def test_rejects_mismatch_and_forged_prod(self):
        for field,value in [('sourceSha','b'*40),('emittedBuildId','otherBuild'),('productionAttested',True),('certified',True)]:
            with self.subTest(field=field):
                obj=sample('brain');obj[field]=value
                with self.assertRaises(ValueError):dig.analyze('brain',self.use('brain',obj),SHA)
    def test_rejects_missing_and_malformed_receipts(self):
        with self.assertRaises(ValueError):dig.analyze('tests',self.use('tests',{}),SHA)
        with self.assertRaises(ValueError):dig.analyze('tests',self.use('tests',sample('tests')), 'not-a-sha')
    def test_markup_untrusted_content_is_neutralized(self):
        obj=sample('brain',True);obj['controlledFixtures'][0]['name']='x\n# COMMAND|\x60danger\x60'
        r=dig.analyze('brain',self.use('brain',obj),SHA)
        self.assertNotIn('\n# COMMAND',dig.markdown(r))
        self.assertNotIn('\x60danger\x60',dig.markdown(r))

if __name__=='__main__':unittest.main()
