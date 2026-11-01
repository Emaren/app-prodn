"""Owner-only nonfinancial A01: genuine source, exact CI, zero external reviewers."""
import copy
import importlib.util
import json
from pathlib import Path
import types
import unittest
from unittest import mock

base=Path(__file__).resolve().parents[1]
def load(name,relative):
    spec=importlib.util.spec_from_file_location(name,base/relative)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
mac=load('a01_owner_v3_mac','scripts/r25_c_start_recovery_v3_mac.py')
root=load('a01_owner_v3_root','scripts/r25_c_start_recovery_v3_root.py')
FENCE=chr(96)*3
class OwnerReleaseAcceptance(unittest.TestCase):
    def facts(self):
        source='a'*40
        operator=b'root-bytes'*220
        launcher=b'mac-bytes'*30
        record={'schema':mac.OWNER_SCHEMA,'decision':'ACCEPT',
                'scope':'RECOVERY_START_3031_V3_ONLY','source_sha':source,
                'release_authority':'OWNER_ONLY_NONFINANCIAL','owner_login':'Emaren',
                'independent_review':False,'owner_accepts_no_independent_review':True,
                'nonfinancial_only':True,'public_cutover_authorized':False,
                'financial_authorized':False,
                'exact_head_ci':{'run_id':41321783192,'head_sha':source,
                     'conclusion':'success','all_three_jobs_success':True}}
        for label,data in (('operator',operator),('mac',launcher)):
            record.update({label+'_size':len(data),label+'_sha256':mac.sha(data),
                           label+'_blob':mac.blob(data)})
        body=mac.OWNER_HEADER+'\n'+FENCE+'json\n'+json.dumps(record)+'\n'+FENCE
        comment={'id':44,'html_url':'https://github.com/Emaren/app-prodn/pull/1115#issuecomment-44',
                 'issue_url':'https://api.github.com/repos/Emaren/app-prodn/issues/1115',
                 'user':{'login':'Emaren'},'created_at':'2026-11-01T19:45:00Z','body':body}
        ci={'head_sha':source,'status':'completed','conclusion':'success','name':'AoE2WAR CI'}
        jobs={'total_count':3,'jobs':[{'name':n,'status':'completed','conclusion':'success'}
              for n in ('Release and documentation control plane',
                        'Type, contract, and production build',
                        'Isolated Steam-rating PostgreSQL chronology')]}
        return [source,operator,launcher,comment,ci,jobs]
    def check(self,data):
        source,operator,launcher,comment,ci,jobs=data
        calls=[]
        def gh(args,**kw):
            calls.append(args)
            return types.SimpleNamespace(returncode=0,stdout=json.dumps([comment,ci,jobs][len(calls)-1]).encode())
        with mock.patch.object(mac.Path,'is_file',return_value=True), \
             mock.patch.object(mac.subprocess,'run',side_effect=gh):
            result=mac.review_comment('44',mac.sha(comment['body'].encode()),source,operator,launcher)
        return result,calls
    def payload(self,data,body,url,proof):
        return {'review_body':body,'review_body_sha256':root.sha(body.encode()),
                'source_sha':data[0],'operator_sha256':mac.sha(data[1]),
                'operator_size':len(data[1]),'operator_blob':mac.blob(data[1]),
                'review_url':url,'review_author':'Emaren',
                'review_issue_url':'https://api.github.com/repos/Emaren/app-prodn/issues/1115',
                'github_review_proof':proof}
    def test_owner_acceptance_exact_ci_and_source_without_any_reviewer(self):
        data=self.facts()
        (body,url,proof),calls=self.check(data)
        self.assertEqual(len(calls),3,'no reviewer GitHub API call needed')
        self.assertEqual(proof['mode'],'OWNER_ONLY_NONFINANCIAL')
        self.assertEqual(root.reviewed(self.payload(data,body,url,proof))['release_authority'],'OWNER_ONLY_NONFINANCIAL')
    def test_wrong_owner_or_wrong_source_fails(self):
        for mode in ('comment-author','source-sha','source-bytes','independent-claim',
                     'financial','public-cutover','missing-risk','schema','fake-reviewer','ci'):
            with self.subTest(mode=mode):
                d=copy.deepcopy(self.facts())
                record=json.loads(d[3]['body'].split(FENCE+'json\n')[1].split('\n'+FENCE)[0])
                if mode=='comment-author':d[3]['user']['login']='Timed-AutoMaton'
                if mode=='source-sha':record['source_sha']='b'*40
                if mode=='source-bytes':record['operator_sha256']='f'*64
                if mode=='independent-claim':record['independent_review']=True
                if mode=='financial':record['financial_authorized']=True
                if mode=='public-cutover':record['public_cutover_authorized']=True
                if mode=='missing-risk':record.pop('owner_accepts_no_independent_review')
                if mode=='schema':record['schema']='owner-accept-v0'
                if mode=='fake-reviewer':record['reviewer']='/root/security_review'
                if mode=='ci':record['exact_head_ci']['all_three_jobs_success']=False
                d[3]['body']=mac.OWNER_HEADER+'\n'+FENCE+'json\n'+json.dumps(record)+'\n'+FENCE
                with self.assertRaises(RuntimeError):self.check(d)
    def test_root_rejects_fabricated_owner_proof_and_financial_elevation(self):
        d=self.facts()
        (body,url,proof),_=self.check(d)
        payload=self.payload(d,body,url,proof)
        for k,v in [('mode','OPTIONAL_INDEPENDENT_REVIEW'),
                    ('owner_login','Timed-AutoMaton'),
                    ('owner_comment_sha256','f'*64),
                    ('review_commit','b'*40)]:
            with self.subTest(k=k):
                bad={**payload,'github_review_proof':{**proof,k:v}}
                with self.assertRaises(root.Hold):root.reviewed(bad)

if __name__=='__main__':unittest.main()
