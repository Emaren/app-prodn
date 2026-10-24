#!/usr/bin/env python3
"""ONLY synthetic PostgreSQL 16 data for indexed Founder Bonus audit CI.
Prints DDL/DML to disposable GitHub Actions PostgreSQL, never connects to server.
"""
from __future__ import annotations

def quoted(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"

def main():
    print("""
CREATE TABLE pending_wolo_claims (
  id INTEGER PRIMARY KEY, source_founder_bonus_id INTEGER,
  normalized_player_name TEXT, claimed_by_user_id INTEGER,
  amount_wolo INTEGER, payout_tx_hash TEXT, created_at TIMESTAMP,
  claim_kind TEXT, status TEXT
);
CREATE TABLE wolo_indexed_transfers (
  tx_hash TEXT, transfer_index INTEGER, chain_id TEXT, denom TEXT,
  amount_uwolo BIGINT, recipient_address TEXT, sender_address TEXT,
  timestamp TIMESTAMP, height BIGINT
);
CREATE UNIQUE INDEX uq_wolo_idx_tx_transfer
  ON wolo_indexed_transfers(tx_hash, transfer_index);
CREATE INDEX ix_wolo_tx_hash ON wolo_indexed_transfers(tx_hash);
CREATE TABLE users(id INTEGER PRIMARY KEY,wallet_address TEXT);
-- Deliberately large unrelated index to detect accidental full-table materialization.
INSERT INTO wolo_indexed_transfers
 SELECT lpad(to_hex(g+1000000),64,'0'), 0, 'wolo-1', 'uwolo',1000000,
        'synthetic-decoy-recipient','synthetic-decoy-sender',
        TIMESTAMP '2026-01-01',g
 FROM generate_series(1,80000) g;
""")
    for i in range(25):
        g=i+1
        amount=3404 if i==24 else 1
        old_hash=f"{g+5000:064x}"
        july_hash=f"{g+6000:064x}"
        first_id=1001+i
        july_id=2001+i
        name=f"synthetic-player-{g}"
        wallet=f"synthetic-recipient-{g}"
        jul_rec=wallet if i<5 else f"synthetic-reassigned-{g}"
        now="2026-07-04 12:00:00"
        # Six July index transfers timestamped BEFORE the synthetic claim row.
        jul_event="2026-07-04 11:59:00" if i<6 else "2026-07-04 12:01:00"
        old_height=100+g
        jul_height=99 if i==24 else 300+g
        print(f"INSERT INTO users VALUES ({g},{quoted(wallet)});")
        print("INSERT INTO pending_wolo_claims VALUES ("+",".join([
            str(first_id),str(g),quoted(name),str(g),str(amount),
            quoted(old_hash),quoted("2026-06-21 00:00:00"),
            "'founders_bonus'","'claimed'"]) + ");")
        print("INSERT INTO pending_wolo_claims VALUES ("+",".join([
            str(july_id),str(g),quoted(name),str(g),str(amount),
            quoted(july_hash),quoted(now),
            "'founders_bonus'","'claimed'"]) + ");")
        for hash_,rec,time_,height in [
            (old_hash,wallet,"2026-06-22 00:00:00",old_height),
            (july_hash,jul_rec,jul_event,jul_height)]:
            print("INSERT INTO wolo_indexed_transfers VALUES (" + ",".join([
                quoted(hash_),"0","'wolo-1'","'uwolo'",
                str(amount*1000000),quoted(rec),"'synthetic-only-sender'",
                quoted(time_),str(height)])+");")
    print("ANALYZE pending_wolo_claims; ANALYZE wolo_indexed_transfers; ANALYZE users;")

if __name__=="__main__": main()
