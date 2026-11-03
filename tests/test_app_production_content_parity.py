"""Release guard checks actual published event and certified Traffic before Nginx switching."""
from pathlib import Path
import importlib.util
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('fg_content',ROOT/'scripts/aoe2_r24_f_parallel_nginx_cutover.py')
f=importlib.util.module_from_spec(spec)
spec.loader.exec_module(f)

TITLE='Monday Night Mayhem'
OLD_TRAFFIC='<html><body>LAST PUBLISHED UTC DAY: 2026-10-19 Traffic Total Traffic</body></html>'
OBSERVED='<p>Latest observed UTC day 2026-11-03</p><p>Provisional · unverified</p>'
CAND_TRAFFIC='<html><body>LAST PUBLISHED UTC DAY: 2026-10-20 Traffic Total Traffic'+OBSERVED+'</body></html>'
EMPTY_TRAFFIC='<html><body>LAST PUBLISHED UTC DAY: UNAVAILABLE No published completed-day Traffic report is available.</body></html>'

class ReleaseContentGate(unittest.TestCase):
    def check(self, new_home=f'<main>{TITLE}</main>', new_traffic=CAND_TRAFFIC, old_home=f'<main>{TITLE}</main>', old_traffic=OLD_TRAFFIC, title=TITLE):
        pages={(3030,'/'):old_home,(3032,'/'):new_home,(3030,'/traffic'):old_traffic,(3032,'/traffic'):new_traffic}
        with mock.patch.object(f,'production_published_event_title',return_value=title),mock.patch.object(f,'production_content_html',side_effect=lambda port,route:pages[(port,route)]) as pages_requested:
            result=f.production_content_parity()
            self.assertEqual(pages_requested.call_count,4)
            self.assertTrue(result['anonymous_get_only'])
            self.assertFalse(result['financial_authorized'])
            return result

    def test_valid_modern_event_and_newer_certified_traffic_pass(self):
        p=self.check()
        self.assertEqual(p['candidate_published_day'],'2026-10-20')
        self.assertEqual(len(p['published_event_title_sha256']),64)

    def test_same_day_nonregression_is_allowed(self):
        p=self.check(new_traffic=OLD_TRAFFIC.replace('</body>',OBSERVED+'</body>'))
        self.assertEqual(p['candidate_published_day'],p['original_published_day'])

    def test_old_event_or_stale_new_event_hold_before_plan(self):
        for old,new in (('old hero','old hero'),(f'<main>{TITLE}</main>','<main>WOLOMANIA I</main>')):
            with self.subTest(old=old,new=new),self.assertRaisesRegex(f.Hold,'CONTENT_PARITY_'):
                self.check(old_home=old,new_home=new)

    def test_blank_traffic_on_new_candidate_is_release_hold(self):
        for bad in (EMPTY_TRAFFIC,'<html><body>Traffic: loading</body></html>'):
            with self.subTest(bad=bad),self.assertRaisesRegex(f.Hold,'CONTENT_PARITY_'):
                self.check(new_traffic=bad)

    def test_old_traffic_absence_cannot_be_waived(self):
        with self.assertRaisesRegex(f.Hold,'CONTENT_PARITY_'):
            self.check(old_traffic=EMPTY_TRAFFIC)

    def test_candidate_traffic_date_must_not_move_backwards(self):
        with self.assertRaisesRegex(f.Hold,'CONTENT_PARITY_TRAFFIC_ARCHIVE_REGRESSION'):
            self.check(new_traffic='<html><body>LAST PUBLISHED UTC DAY: 2026-10-18 Traffic</body></html>')

    def test_script_embedded_date_cannot_falsify_visible_report(self):
        spoof='<html><body><script>LAST PUBLISHED UTC DAY: 2030-01-01</script><p>unavailable</p></body></html>'
        with self.assertRaisesRegex(f.Hold,'CONTENT_PARITY_PUBLISHED_DAY_MISSING'):
            self.check(new_traffic=spoof)

    def test_missing_or_overlapping_observed_data_is_hold(self):
        for bad in (CAND_TRAFFIC.replace(OBSERVED, ''), CAND_TRAFFIC.replace('2026-11-03', '2026-10-20')):
            with self.subTest(bad=bad), self.assertRaisesRegex(f.Hold, 'CONTENT_PARITY_OBSERVED_TRAFFIC_ABSENT'):
                self.check(new_traffic=bad)

    def test_existing_browser_observed_aggregate_cannot_regress(self):
        old = OLD_TRAFFIC.replace('</body>', '<p>BROWSER OBSERVED</p></body>')
        with self.assertRaisesRegex(f.Hold, 'CONTENT_PARITY_OBSERVED_BROWSER_INSIGHTS_LOST'):
            self.check(old_traffic=old)
        passed = self.check(old_traffic=old, new_traffic=CAND_TRAFFIC.replace('</body>', '<p>BROWSER OBSERVED</p></body>'))
        self.assertTrue(passed['candidate_observed_browser_insights'])

    def test_release_controller_calls_parity_before_authorization(self):
        source=(ROOT/'scripts/aoe2_r24_f_parallel_nginx_cutover.py').read_text()
        plan=source[source.index('def production_inputs('):source.index('def production_grant(')]
        self.assertLess(plan.index('content_parity=production_content_parity()'),plan.index('plan={'))
        self.assertIn("'content_parity':content_parity",plan)
        self.assertIn("return envelope,",plan)
        apply=source[source.index('def production_apply('):source.index('def production_rollback(')]
        self.assertLess(apply.index('production_inputs(options)'),apply.index('production_grant('))

if __name__=='__main__':unittest.main()
