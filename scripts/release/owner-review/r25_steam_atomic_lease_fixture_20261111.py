#!/usr/bin/env python3
"""Disposable Linux 6.8 / nftables 1.0.9 TEST-NET fixture.
MUST execute only inside a NEW network namespace. NEVER touch host namespace.
This is not a production maintenance executable or an admission permit.
"""
import collections
import concurrent.futures
import json
import os
import subprocess
import threading
import time

TABLE="aoe2war_web_prod"
IP1,IP2,STALE,NEW="192.0.2.11","192.0.2.12","192.0.2.13","192.0.2.14"
assert os.readlink("/proc/self/ns/net") != os.readlink("/proc/1/ns/net"), "HOLD_HOST_NET_NAMESPACE"
def command(args, stdin=None, ok=True):
    p=subprocess.run(args,input=stdin,text=True,capture_output=True,timeout=12)
    if ok and p.returncode: raise AssertionError((args,p.stdout,p.stderr))
    if not ok and not p.returncode: raise AssertionError(("EXPECTED_REJECTION",args,p.stdout))
    return p
def batch(lines,ok=True):
    return command(["nft","-f","-"],"\n".join(lines)+"\n",ok=ok)
def raw():
    return json.loads(command(["nft","-j","list","table","inet",TABLE]).stdout)["nftables"]
def elements(name="steam4"):
    item=next(x["set"] for x in raw() if x.get("set",{}).get("name")==name)
    return {el["elem"]["val"]:int(el["elem"].get("expires",0)) for el in item.get("elem",[]) }
def shape():
    result=[]
    for obj in raw():
        if "metainfo" in obj: continue
        o=json.loads(json.dumps(obj))
        if "set" in o:o["set"].pop("elem",None)
        result.append(o)
    return result
def renew(validated,existing,expected_preimage):
    # Production maintenance has stricter real DNS+CA+SNI witnesses; TEST-NET
    # validated is a synthetic isolated-fixture input ONLY.
    assert shape()==expected_preimage, "HOLD_FIREWALL_SHAPE_DRIFT"
    before=elements()
    assert before==existing, "HOLD_CONCURRENT_NATIVE_WRITER"
    assert validated and validated.issubset(existing), "HOLD_MISSING_OR_UNVERIFIED_ADDRESS"
    assert len(validated)<=16, "HOLD_CAP"
    cmds=[]
    for ip in sorted(validated):
        cmds.append(f"delete element inet {TABLE} steam4 {{ {ip} }}")
        cmds.append(f"add element inet {TABLE} steam4 {{ {ip} timeout 300s }}")
    # One netlink transaction, never one subprocess per element.
    batch(cmds)
def verify_set_shape():
    sets={x["set"]["name"]:x["set"] for x in raw() if "set" in x}
    assert set(sets)=={"steam4","steam6"},sets.keys()
    for name,typ in [("steam4","ipv4_addr"),("steam6","ipv6_addr")]:
        t=sets[name]
        assert t["type"]==typ and t["flags"]==["timeout"] and t["timeout"]==300
    return sets
def run():
    print("FIXTURE_STARTED",os.readlink("/proc/self/ns/net"),"pid1",os.readlink("/proc/1/ns/net"),flush=True)
    print("KERNEL",command(["uname","-r"]).stdout.strip(),
          "NFT",command(["nft","--version"]).stdout.strip(),flush=True)
    batch([
      f"add table inet {TABLE}",
      f"add set inet {TABLE} steam4 {{ type ipv4_addr; flags timeout; timeout 300s; }}",
      f"add set inet {TABLE} steam6 {{ type ipv6_addr; flags timeout; timeout 300s; }}",
      f"add chain inet {TABLE} output {{ type filter hook output priority filter; policy accept; }}",
      f"add rule inet {TABLE} output ip daddr @steam4 tcp dport 443 accept",
      f"add element inet {TABLE} steam4 {{ {IP1} timeout 95s, {IP2} timeout 170s, {STALE} timeout 70s }}"
    ])
    verify_set_shape()
    fixed=shape()
    start=elements()
    assert set(start)=={IP1,IP2,STALE}
    assert 90<=start[IP1]<=95 and 165<=start[IP2]<=170
    print("PASS_PRODUCTION_SHAPED_TABLE_RULE_FLAGS_TIMEOUT",start,flush=True)
    # One atomic nft -f delete+add for only the same two fixture-verified
    # addresses; the stale unrelated element is never touched or extended.
    renew({IP1,IP2},start,fixed)
    after=elements()
    assert 288<=after[IP1]<=300 and 288<=after[IP2]<=300,after
    assert 0<after[STALE]<=start[STALE] and set(after)==set(start),after
    assert shape()==fixed and verify_set_shape()
    print("PASS_ATOMIC_RENEW_SAME_IPS_300_NO_WIDEN_NO_EXTRA",after,flush=True)
    # A valid first delete+add followed by a failing kernel operation must
    # leave the existing whole transaction unmodified.
    prior=elements()
    bad=batch([
       f"delete element inet {TABLE} steam4 {{ {IP1} }}",
       f"add element inet {TABLE} steam4 {{ {IP1} timeout 300s }}",
       f"delete element inet {TABLE} steam4 {{ 192.0.2.200 }}"
    ],ok=False)
    remaining=elements()
    assert set(remaining)==set(prior)
    assert abs(remaining[IP1]-prior[IP1])<=3,(prior,remaining)
    assert shape()==fixed
    print("PASS_PARTIAL_NETLINK_KERNEL_FAILURE_ATOMIC_ROLLBACK",bad.stderr.strip()[:180],flush=True)
    # A parser-level invalid batch must not remove the valid element.
    prior=elements()
    bad=batch([
       f"delete element inet {TABLE} steam4 {{ {IP1} }}",
       "invalid atomically release untrusted access"
    ],ok=False)
    remaining=elements()
    assert set(remaining)==set(prior) and abs(remaining[IP1]-prior[IP1])<=3
    print("PASS_SYNTAX_ERROR_BEFORE_ANY_CHANGE",flush=True)
    # DNS churn or absent expected set members is a fail-before-nft-write.
    prior=elements()
    for wrong in ({NEW},{IP1,NEW},set()):
        try: renew(wrong,prior,fixed)
        except AssertionError as err: assert str(err).startswith("HOLD_"),err
        else: raise AssertionError("INSECURE_ADMISSION_OF_UNVERIFIED_ADDRESS")
    assert elements()==prior or all(abs(elements()[k]-prior[k])<=3 for k in prior)
    print("PASS_MISSING_ADDRESS_DNS_CHURN_AND_EMPTY_WITNESS_REFUSED",flush=True)
    # Simulate V20 writer adding another native verified IP between baseline
    # and atomic renewal. Pre-transaction guarded compare must abort.
    prior=elements()
    batch([f"add element inet {TABLE} steam4 {{ {NEW} timeout 110s }}"])
    try: renew({IP1,IP2},prior,fixed)
    except AssertionError as err: assert "HOLD_CONCURRENT_NATIVE_WRITER" in str(err),err
    else: raise AssertionError("MISSED_NATIVE_TIMER_RACE")
    assert NEW in elements() and elements()[NEW] <=110
    print("PASS_NATIVE_TIMER_CONCURRENT_ADDITION_DETECTED_BEFORE_WRITE",flush=True)
    # Remove only fixture simulated native-writer addition, no production.
    batch([f"delete element inet {TABLE} steam4 {{ {NEW} }}"])
    # Simultaneous observations of the fixture's set around repeated single
    # transactions must never reveal the target set half-deleted.
    samples=[]
    stop=threading.Event()
    def observe():
        while not stop.is_set():
            try:samples.append(frozenset(elements()))
            except Exception as exc:samples.append(("ERROR",str(exc)))
            time.sleep(.018)
    observer=threading.Thread(target=observe,daemon=True)
    observer.start()
    for _ in range(7):
        prior=elements()
        renew({IP1,IP2},prior,fixed)
        time.sleep(.035)
    stop.set(); observer.join(timeout=5)
    assert len(samples)>=4,len(samples)
    assert all(x==frozenset({IP1,IP2,STALE}) for x in samples),samples
    assert shape()==fixed
    print("PASS_CONCURRENT_READERS_NO_INTERMEDIATE_FIREWALL_GAP",len(samples),"snapshots",flush=True)
    # Historical TTL cannot be restored to the exact *nanosecond* via nft
    # userspace; fail/rollback-before-commit is exact, successful renewal
    # is bounded by unchanged 300s. Do NOT claim exact inverse afterward.
    print("PASS_BOUNDED_MAX_TTL_300_EXACT_PRECOMMIT_ROLLBACK_ONLY",flush=True)
    print("PASS_ALL_DISPOSABLE_NETNS_TESTS_NO_PRODUCTION_NFT_MUTATION",flush=True)
if __name__=="__main__":run()
