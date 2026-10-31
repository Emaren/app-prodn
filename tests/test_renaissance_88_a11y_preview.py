"""Quarantined accessibility preview must never turn into a source-seal bypass."""
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
class PreviewSourceIsolation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source=(ROOT/"scripts/renaissance_88_plan.py").read_text()
        cls.guard=(ROOT/"scripts/renaissance_88_preview_manifest_guard.sh").read_text()
        cls.preview=(ROOT/".github/workflows/renaissance-88-a11y-preview.yml").read_text()
        cls.official=(ROOT/".github/workflows/renaissance-88-factory.yml").read_text()
    def test_default_still_requires_clean_git_head(self):
        self.assertIn("preview_unsealed_generated_policy:bool=False",self.source)
        self.assertIn("if not preview_unsealed_generated_policy:",self.source)
        self.assertIn('raise ValueError("Cannot bind census to clean exact Git head")',self.source)
        self.assertNotIn("--preview-unsealed-generated-policy",self.official)
    def test_preview_one_tracked_generated_file_only(self):
        self.assertIn('[" M lib/pageChangeManifest.generated.ts"]',self.source)
        self.assertIn("changed!=",self.source)
        self.assertIn("unsealed a11y preview",self.preview.lower())
        self.assertIn("--preview-unsealed-generated-policy",self.preview)
        self.assertIn('"source_clean":clean',self.source)
        self.assertIn('"derived_policy_unsealed":not clean',self.source)
        self.assertIn('HOLD_GENERATED_POLICY_RESEAL',self.source)
        self.assertIn("GENERATED_POLICY_NOT_SEALED",self.source)
    def test_manifest_guard_deterministic_and_immutable(self):
        self.assertIn("git diff --quiet -- .",self.guard)
        self.assertIn("git diff --cached --quiet",self.guard)
        self.assertIn("first=",self.guard)
        self.assertIn("second=",self.guard)
        self.assertIn('[[ "$first" == "$second" ]]',self.guard)
        self.assertIn("REN88_GENERATED_MANIFEST_SHA",self.guard)
        self.assertIn("INDEX_ADMISSION=HOLD_UNTIL_CENTRAL_SEAL",self.guard)
        self.assertIn("renaissance_88_preview_manifest_guard.sh verify",self.preview)
    def test_real_next_build_id_is_option_bound_and_fails_closed(self):
        # Next.js nanoids may begin with '-'; a separate argparse argv token
        # would be parsed as an option, even though BUILD_ID is nonempty.
        self.assertIn('BUILD_ID="$(cat .next/BUILD_ID)"', self.preview)
        self.assertIn('--expected-build-id="$BUILD_ID"', self.preview)
        self.assertNotIn('--expected-build-id "$(cat .next/BUILD_ID)"', self.preview)
        self.assertIn('[[ ! "$BUILD_ID" =~ ^[A-Za-z0-9_-]{10,128}$ ]]', self.preview)
        self.assertIn('"$(cat renaissance-88-chrome/BUILD_ID)" != "$BUILD_ID"', self.preview)
        self.assertIn('exit 2', self.preview)
        self.assertIn('printf \'source=%s\\nbuild=%s\\ncandidate_only=true\\n\' "$SOURCE_SHA" "$BUILD_ID"', self.preview)
    def test_r17_exact_width_chrome_hold_cannot_be_hidden_by_88_route_pass(self):
        self.assertIn('w1safe_rc=$?', self.preview)
        self.assertIn('BROWSER_EXIT=%s W1SAFE_R16_EXIT=%s', self.preview)
        self.assertIn('if [ "$browser_rc" -ne 0 ] || [ "$w1safe_rc" -ne 0 ]; then', self.preview)
        self.assertIn('W1_SAFE_CHROME_HOLD:', self.preview)
        self.assertIn('test -s renaissance-88-chrome/w1safe-r16/review.json', self.preview)
        self.assertNotIn('exit "$browser_rc"', self.preview)
    def test_r18_blocked_requests_keep_sanitized_origin_path_and_cdp_initiator(self):
        chrome=(ROOT/"scripts/aoe2_release_r16_w1safe_disposable_chrome.cjs").read_text()
        self.assertIn('const cdp = await context.newCDPSession(page)',chrome)
        self.assertIn('Network.requestWillBeSent',chrome)
        self.assertIn('initiator:{type:"CDP_PENDING",frames:[]}',chrome)
        self.assertIn('location:where(req.url())',chrome)
        self.assertIn('method:req.method()',chrome)
        self.assertIn('resource_type:req.resourceType()',chrome)
        self.assertIn('frame,',chrome)
        self.assertIn('return route.abort()',chrome)
        self.assertIn('W1SAFE_R18_BLOCKED_REQUESTS',chrome)
        self.assertIn('u.pathname.slice(0,240)',chrome)
        self.assertNotIn('u.search',chrome)
        self.assertNotIn('u.hash',chrome)
        self.assertNotIn('req.postData()',chrome)
        self.assertNotIn('req.headers()',chrome)
        self.assertIn('entry.mutations_blocked===0?',chrome)

    def test_r19_source_bound_blocked_background_requests_never_dispatch(self):
        chrome=(ROOT/"scripts/aoe2_release_r16_w1safe_disposable_chrome.cjs").read_text()
        self.assertIn('"app/api/speed/sample/route.ts":"6c4a24250d12dc51a8fb8d9643eb69a1f8292776"',chrome)
        self.assertIn('"app/api/kingdom-presence/anonymous-state/route.ts":"5523f0f98107c6d04bfd40b1a2cdd21aa1709906"',chrome)
        self.assertIn('"lib/livingKingdom/hub.ts":"afb0bbcd9dd2ddc19281c807d23ff79871935a16"',chrome)
        self.assertIn('"rev-parse","HEAD:"+p',chrome)
        self.assertIn('"hash-object","--",p',chrome)
        self.assertIn('BACKGROUND_ROUTE_SOURCE_DRIFT:',chrome)
        self.assertIn('"/api/speed/sample":{count:2,initiatorPrefix:"/_next/static/chunks/app/layout-"}',chrome)
        self.assertIn('"/api/kingdom-presence/anonymous-state":{count:1,initiatorPrefix:"/_next/static/chunks/"}',chrome)
        self.assertIn('request.reason==="NON_READ_METHOD" && request.method==="POST"',chrome)
        self.assertIn('request.resource_type==="fetch" && frame.origin===base',chrome)
        self.assertIn('stack.type==="script"',chrome)
        self.assertIn('all_post_attempts_aborted:true',chrome)
        self.assertIn('server_post_mutation_proven:false',chrome)
        self.assertIn('production_accepted:false',chrome)
        self.assertIn('unknown.length===0',chrome)
        self.assertIn('entry.blocked_request_overflow===0 && entry.mutations_blocked===3',chrome)
        self.assertIn('entry.foreign_blocked===2',chrome)
        self.assertIn('entry.fixture_classification.verdict==="PASS_BLOCKED_BACKGROUND_ONLY"',chrome)
        self.assertIn('W1SAFE_R19_BLOCKED_REQUESTS',chrome)
        self.assertIn('return route.abort()',chrome)
        self.assertNotIn('route.fulfill(',chrome)
        self.assertNotIn('route.continue({ method:',chrome)

    def test_only_plan_from_exact_next_build_can_use_preview(self):
        self.assertIn('o.action!="plan" or o.build_dir is None',self.source)
        self.assertIn("Unsealed preview requires exact built Next",self.source)
        self.assertIn("source_clean:plan.source_clean===true", (ROOT/"scripts/renaissance_88_browser.cjs").read_text())
        self.assertIn("source_admission:plan.source_admission", (ROOT/"scripts/renaissance_88_receipts.mjs").read_text())
if __name__=="__main__":
    unittest.main()
