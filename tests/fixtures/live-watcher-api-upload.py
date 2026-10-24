"""Controlled parser -> REAL API authentication/archive/SQL commit/private bridge.

Imports the exact separately reviewed Replay API source. Synthetic bytes and a
controlled parser are explicit test inputs, never a human LIVE capture. Accepts
ONLY the disposable HD fixture's Unix socket and role; no inherited DB URL.
"""
import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import inspect
import io
import json
import os
from pathlib import Path
import sys
from unittest.mock import patch

SOURCE = "5a2750849e59f0e4551c6e9e0417b59254cff467"
root = Path(sys.argv[1]).resolve(strict=True)
assert root.parent == Path("/tmp").resolve() and root.name.startswith("aoe2-live-watcher-")
assert (root / "socket/.s.PGSQL.5432").exists()
# The API's import-time DB engine is deliberately unreachable. Only the explicit
# private Unix-socket engine below is ever opened, after a catalog role check.
os.environ.update(DATABASE_URL="postgresql+asyncpg://fixture@127.0.0.1:1/unused", ENV="test",
                  DOTENV_CONFIG_PATH=str(root / "no-dotenv"), INTERNAL_API_KEY="controlled-live-bridge-only")
for name in ("DIRECT_URL", "SHADOW_DATABASE_URL", "PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"):
    os.environ.pop(name, None)
api_source = Path(os.environ["LIVE_ADMISSION_API_SOURCE"]).resolve(strict=True)
sys.path.insert(0, str(api_source))
from fastapi import BackgroundTasks, UploadFile
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from routes import replay_routes_async as route
from db.models import GameStats, ReplayParseAttempt, ApiKey, User
from utils import replay_post_ingest_bridge as bridge
from utils.satchel_original_live_capture import EVIDENCE_KEY

OWNER = "controlled-live-owner"
KEY = "wolo_000000000000_controlled-fixture-only"
RAW = b"controlled ORIGINAL LIVE checkpoint; parser fixture, never mainnet evidence"
SHA = hashlib.sha256(RAW).hexdigest()
BAD_RAW = RAW + b"; invalid provenance signature"
BAD_SHA = hashlib.sha256(BAD_RAW).hexdigest()
NOW = datetime.now(timezone.utc)
FILENAME = (NOW-timedelta(seconds=30)).strftime("game @%Y.%m.%d %H%M%S.aoe2mpgame")
canonical = "\n".join(["aoe2war-watcher-provenance/v1", "live_monitor", "desktop-local-uid",
                        "controlled-original-hd-watcher", "original-live/1v1-rm", "original-live-fingerprint/1v1-rm", SHA, "1", "false"])
SIGNATURE = hmac.new(KEY.encode(), canonical.encode(), hashlib.sha256).hexdigest()
PARSED = {"game_version":"Version.HD", "game_type":"Random Map", "duration":0, "winner":"Unknown",
          "players":[{"name":"LiveOwner","steam_id":"76561198000000001","team_id":0},
                     {"name":"LiveOpponent","steam_id":"76561198000000002","team_id":1}],
          "key_events":{"completed":False,"postgame_available":False,"platform_match_id":"controlled-hd-1v1-rm",
                        "saved_game_snapshot":True,"saved_game_raw_deflate_complete":True,
                        "saved_game_structure_scope":"initial_state_prefix","restore_time_ms":7000,"snapshot_elapsed_seconds":7}}

async def controlled_parser(filename, **kwargs):
    raw = Path(filename).read_bytes()
    assert raw in (RAW, BAD_RAW) and kwargs == {"apply_hd_early_exit_rules":False}
    parsed = deepcopy(PARSED)
    if raw == BAD_RAW: parsed["key_events"]["platform_match_id"] = "controlled-hd-forged-hmac"
    return parsed

class BridgeResponse:
    status = 200
    def __enter__(self): return self
    def __exit__(self, *exc): return False
    def read(self): return b'{"success":true}'

async def main():
    engine = create_async_engine("postgresql+asyncpg://live_watcher_fixture@/postgres", connect_args={"host":str(root/"socket"),"ssl":False})
    session = async_sessionmaker(engine, expire_on_commit=False)
    sent = []
    try:
        async with session() as db:
            assert (await db.execute(text("SELECT current_user"))).scalar_one() == "live_watcher_fixture"
            owner = (await db.execute(select(User).where(User.uid==OWNER))).scalar_one()
            assert owner.steam_id == "76561198000000001"
            db.add(ApiKey(user_id=owner.id,key_prefix="000000000000",key_hash=hashlib.sha256(KEY.encode()).hexdigest(),kind="watcher"))
            await db.commit()
            task = BackgroundTasks()
            params = {name:None for name in inspect.signature(route.upload_replay_file).parameters if name.startswith("x_")}
            params.update(x_api_key=KEY,x_is_final="false",x_parse_iteration="1",x_parse_source="watcher_live",x_parse_reason="watcher_live_snapshot",
                          x_watcher_id="controlled-original-hd-watcher",x_watcher_session_id="original-live/1v1-rm",x_watcher_client_uid="desktop-local-uid",
                          x_watcher_provenance="live_monitor",x_watcher_provenance_signature=SIGNATURE,x_file_role="live_checkpoint",
                          x_client_sha256=SHA,x_replay_fingerprint="original-live-fingerprint/1v1-rm",x_file_size_bytes=str(len(RAW)))
            with patch.object(route,"REPLAY_ARCHIVE_DIR",root/"api-archive"),patch.object(route,"parse_replay_full",controlled_parser):
                receipt = await route.upload_replay_file(task,file=UploadFile(filename=FILENAME,file=io.BytesIO(RAW)),db_gen=db,
                                                        user_uid="spoofed-header-must-not-own-upload",**params)
            row = (await db.execute(select(GameStats).where(GameStats.id==receipt["game_id"]))).scalar_one()
            assert row.user_uid == OWNER and row.parse_source == "watcher_live" and not row.is_final
            upload = row.key_events["watcher_upload"]
            assert upload["provenance_signature_verified"] and upload["client_sha256_verified"] and upload["server_sha256"] == SHA
            attempt = (await db.execute(select(ReplayParseAttempt).where(ReplayParseAttempt.game_stats_id==row.id))).scalar_one()
            assert attempt.evidence[EVIDENCE_KEY]["financial_authorized"] is False
            assert receipt["finality_status"] == "live" and receipt["should_settle"] is False and receipt["archive_verified"] is True
            archive = root/"api-archive"/SHA[:2]/SHA[2:4]/(SHA+".aoe2mpgame")
            assert archive.read_bytes() == RAW
            # Execute the canonical background notifier with its actual private
            # header and body. Only transport delivery is captured by the test.
            def capture(request, timeout):
                assert request.method == "POST" and request.full_url.endswith("/api/replay/post-ingest")
                assert request.get_header("X-api-key") == "controlled-live-bridge-only" and 1 <= timeout <= 10
                sent.append(json.loads(request.data))
                return BridgeResponse()
            with patch.object(bridge.request,"urlopen",capture): await task()
            assert sent == [{"source":"api_direct","receipt":receipt}]
            bad_params = {**params,"x_client_sha256":BAD_SHA,"x_file_size_bytes":str(len(BAD_RAW)),
                          "x_watcher_session_id":"invalid-signature-session","x_replay_fingerprint":"invalid-signature-fingerprint",
                          "x_watcher_provenance_signature":"0"*64}
            with patch.object(route,"REPLAY_ARCHIVE_DIR",root/"api-archive"),patch.object(route,"parse_replay_full",controlled_parser):
                bad_receipt = await route.upload_replay_file(BackgroundTasks(),file=UploadFile(filename="bad "+FILENAME,file=io.BytesIO(BAD_RAW)),
                                                            db_gen=db,user_uid="spoofed-header-must-not-own-upload",**bad_params)
            bad_row = (await db.execute(select(GameStats).where(GameStats.id==bad_receipt["game_id"]))).scalar_one()
            assert bad_row.user_uid == OWNER and bad_row.key_events["watcher_upload"]["provenance_signature_verified"] is False
            print("LIVE_ADMISSION_API_RECEIPT="+json.dumps({"schema":"controlled-original-live-api-hd/v1","api_source":SOURCE,
                  "controlled_parser":True,"human_live_capture":False,"financial_authority":False,"game_id":row.id,
                  "private_bridge":sent[0],"invalid_hmac_game_id":bad_row.id,"hmac_verified":True,"archive_verified":True,"original_capture_recorded":True}))
    finally: await engine.dispose()

asyncio.run(main())
