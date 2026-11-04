"""Regression: production must render public Traffic without granting broad egress."""
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("traffic_boundary", ROOT / "scripts/r25_c_start_root.py")
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)

class TrafficBoundary(unittest.TestCase):
    def test_proxy_is_one_public_aggregate_get_no_headers_or_body(self):
        conf = c.production_proxy_bytes().decode("utf-8")
        path = "/api/projects/aoe2hdbets/public-audience-series"
        self.assertEqual(conf.count("location = " + path + " {"), 1)
        segment = conf.split("location = " + path + " {", 1)[1].split("\n }", 1)[0]
        for line in ("if ($request_method != GET) { return 405; }",
                     "proxy_pass_request_body off;",
                     'proxy_set_header Cookie "";',
                     'proxy_set_header Authorization "";',
                     'proxy_set_header Content-Length "";',
                     "proxy_method GET;",
                     "proxy_read_timeout 5s;",
                     "proxy_pass http://127.0.0.1:3345" + path + "?;"):
            self.assertIn(line, segment)
        self.assertIn("location / { return 403; }", conf)
        self.assertEqual(conf.count("3345"), 3)
        provisional = "/api/projects/aoe2hdbets/observed-daily-series"
        self.assertEqual(conf.count("location = " + provisional + " {"), 1)
        block = conf.split("location = " + provisional + " {",1)[1].split("\n }",1)[0]
        for line in ("if ($request_method != GET) { return 405; }",
                     "proxy_pass_request_body off;",
                     'proxy_set_header Cookie "";',
                     'proxy_set_header Authorization "";',
                     'proxy_set_header Content-Length "";',
                     "proxy_method GET;",
                     "proxy_read_timeout 5s;",
                     "proxy_pass http://127.0.0.1:3345" + provisional + "?;"):
            self.assertIn(line, block)

    def test_observed_browser_insights_strips_query_headers_and_body(self):
        conf = c.production_proxy_bytes().decode("utf-8")
        path = "/api/projects/aoe2hdbets/observed-browser-insights"
        self.assertEqual(conf.count("location = " + path + " {"), 1)
        segment = conf.split("location = " + path + " {", 1)[1].split("\n }", 1)[0]
        for line in ("if ($request_method != GET) { return 405; }",
                     "proxy_pass_request_body off;",
                     "proxy_pass_request_headers off;",
                     'proxy_set_header Content-Length "";',
                     "proxy_method GET;",
                     "proxy_read_timeout 14s;",
                     "proxy_pass http://127.0.0.1:3345" + path + "?;"):
            self.assertIn(line, segment)

    def test_guard_and_unit_pin_existing_3331_transport(self):
        guard = (ROOT / "scripts/r25_b_guard_production_v1.cjs").read_text()
        unit = c.production_unit_bytes(Path("/var/lib/aoe2war-web-prod-" + "a"*12)).decode()
        self.assertIn('TRAFFIC_API_BASE: "http://127.0.0.1:3331"', guard)
        self.assertIn("TRAFFIC_API_BASE=http://127.0.0.1:3331", unit)
        self.assertIn("function readonlyBackend(input, init = {})", guard)
        self.assertNotIn("3345", guard)
        nft = c.production_nft_bytes(["23.1.2.3"]).decode()
        self.assertIn("{ 5432, 3331 }", nft)
        self.assertNotIn("3345", nft)

    def test_node_guard_endpoint_predicate_allows_only_aggregate_get(self):
        guard = ROOT / "scripts/r25_b_guard_production_v1.cjs"
        javascript = r"""
const fs=require('fs'),vm=require('vm');
const text=fs.readFileSync(process.argv[1],"utf8");
const a=text.indexOf("function readonlyBackend(");
const b=text.indexOf("const fetchOriginal =",a);
if(a<0||b<=a)process.exit(3);
const checker=vm.runInNewContext(text.slice(a,b)+"\nreadonlyBackend;",{URL});
const path="/api/projects/aoe2hdbets/public-audience-series";
const observed="/api/projects/aoe2hdbets/observed-daily-series";
const browser="/api/projects/aoe2hdbets/observed-browser-insights";
const accepted=[
 ["http://127.0.0.1:3331"+browser,{},true],
 ["http://127.0.0.1:3331"+observed,{},true],
 ["http://127.0.0.1:3331"+path,{},true],
 ["http://127.0.0.1:3331/api/health",{method:"GET"},true],
 ["http://127.0.0.1:3331/api/chain-id",{method:"HEAD"},true]];
const denied=[
 ["http://127.0.0.1:3331"+browser,{method:"HEAD"},false],
 ["http://127.0.0.1:3331"+browser,{method:"POST"},false],
 ["http://127.0.0.1:3331"+browser+"?raw=true",{},false],
 ["http://127.0.0.1:3331"+browser,{headers:{Cookie:"fixture"}},false],
 ["http://127.0.0.1:3345"+browser,{},false],
 ["http://127.0.0.1:3331"+observed,{method:"HEAD"},false],
 ["http://127.0.0.1:3331"+observed,{method:"POST"},false],
 ["http://127.0.0.1:3331"+observed+"?raw=true",{},false],
 ["http://127.0.0.1:3331"+path,{method:"HEAD"},false],
 ["http://127.0.0.1:3331"+path,{method:"POST"},false],
 ["http://127.0.0.1:3331"+path,{body:"x"},false],
 ["http://127.0.0.1:3331"+path,{headers:{Authorization:"bearer fake"}},false],
 ["http://127.0.0.1:3331"+path+"?admin=true",{},false],
 ["http://127.0.0.1:3331/api/projects/aoe2hdbets/private-audience-series",{},false],
 ["http://127.0.0.1:3331"+path+"/",{},false],
 ["http://127.0.0.1:3345"+path,{},false],
 ["http://127.0.0.2:3331"+path,{},false],
 ["http://localhost:3331"+path,{},false],
 ["http://127.0.0.1:3331/../admin",{},false],
 ["https://127.0.0.1:3331"+path,{},false],
 ["http://user@127.0.0.1:3331"+path,{},false],
 ["http://127.0.0.1:3331"+path+"#x",{},false]
];
for(const [url,opts,want] of [...accepted,...denied]){
 const got=checker(url,opts);
 if(got!==want)throw Error(JSON.stringify({url,opts,got,want}));
}
console.log(JSON.stringify({accepted:accepted.length,denied:denied.length}));
"""
        p = subprocess.run(["node", "-e", javascript, str(guard)], capture_output=True,
                           text=True, timeout=5)
        self.assertEqual(p.returncode, 0, p.stderr[-900:])
        self.assertEqual(json.loads(p.stdout), {"accepted":5,"denied":22})

if __name__ == "__main__":
    unittest.main()
