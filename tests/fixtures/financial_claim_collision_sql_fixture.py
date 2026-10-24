#!/usr/bin/env python3
"""DISPOSABLE database fixture only. Never connects to production."""
from __future__ import annotations
# Mirrors Python audit tests; 61 synthetic hash groups, 137 claim rows, exact
# historical *aggregate quantities* but no actual transaction or claimant data.
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from test_financial_claim_collision_audit_readonly import PAIRS

def quote(v):
    return "'"+str(v).replace("'","''")+"'"

def main():
    print("""CREATE TABLE pending_wolo_claims (
 id integer PRIMARY KEY, payout_tx_hash text, status text,
 amount_wolo numeric, source_market_id integer, source_game_stats_id integer,
 claim_kind text, claim_group_key text, claimed_by_user_id integer,
 normalized_player_name text, payout_attempted_at timestamp
);
CREATE TABLE wolo_indexed_transfers (
 tx_hash text, amount_uwolo numeric, chain_id text, denom text
);
""")
    g=0
    groups=[]
    for pair, ids, gross, idx, markets in PAIRS:
        groups.append((ids,gross,idx,markets,1,2))
    groups.append(([33,91,94,97],400,0,2,2,2))
    next_id=10000
    for n, gross in [(3,300)]+[(2,200)]*6:
        ids=list(range(next_id,next_id+n));next_id+=n
        groups.append((ids,gross,0,1,1,1))
    for i in range(48):
        n=3 if i<12 else 2
        ids=list(range(next_id,next_id+n));next_id+=n
        groups.append((ids,40 if i<47 else 98,18 if i<47 else 33,1,1,1))
    assert len(groups)==61 and sum(len(x[0]) for x in groups)==137
    for ids,gross,idx,markets,kinds,keycount in groups:
        g+=1
        h=format(g,"064x")
        base=gross//len(ids)
        for j,claim_id in enumerate(ids):
            amount=base+(gross%len(ids) if j==0 else 0)
            market=g*10+(j%markets)
            kind="bet_refund" if kinds==2 and j%2 else "bet_payout"
            key="market" if keycount==1 or j%2==0 else "founder:fixture:other"
            cols=[str(claim_id),quote(h),"'claimed'",str(amount),
                  str(market),str(g*100),quote(kind),quote(key),
                  str(g),quote("synthetic-nonperson"),"'2026-01-01'"]
            print("INSERT INTO pending_wolo_claims VALUES ("+",".join(cols)+");")
        if idx:
            print("INSERT INTO wolo_indexed_transfers VALUES ("+
                 ",".join([quote(h),str(idx*1000000),"'wolo-1'","'uwolo'"])+");")

if __name__=="__main__": main()
