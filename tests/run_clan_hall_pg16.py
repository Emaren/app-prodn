#!/usr/bin/env python3
"""Exact-source disposable PG16 combined Clan Hall image/history regression."""
import argparse, hashlib, os, pathlib, pwd, shutil, subprocess, tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
PINS={"install.sql":"9a0473d0678a9cde9f0c9a48c1ff6304e703e90dd936a2e96f0e02bd81019fbe","fixture.sql":"6dea7c509ab8cd422a8dc6e2281bf736fa2c2960e5dc1dc84a458a67a1f914c6","clan-image-install.sql":"a265cbe16a19c6517a5fb85b84b7f5aaabdc4f501e3aa6ba2b4a73f5ccaba7b7"}
def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument("--pg-bin",type=pathlib.Path,required=True)
 p.add_argument("--we1-reader",type=pathlib.Path,required=True)
 p.add_argument("--we1-image",type=pathlib.Path,required=True)
 a=p.parse_args()
 if os.geteuid()==0:raise RuntimeError("ROOT_FIXTURE_FORBIDDEN")
 pg=a.pg_bin.resolve(strict=True)
 env={k:v for k,v in os.environ.items() if not k.upper().startswith(("PG","GIT_","SOCIAL_","AOE2WAR_")) and k not in ("DATABASE_URL","DIRECT_URL","SESSION_SECRET","NEXTAUTH_SECRET","NODE_OPTIONS")}
 def run(*args,extra=None,cwd=ROOT):
  r=subprocess.run([str(x) for x in args],capture_output=True,text=True,timeout=90,cwd=cwd,env={**env,**(extra or {})})
  if r.stdout:print(r.stdout,end="",flush=True)
  if r.returncode:raise RuntimeError(r.stderr[-4000:])
  return r.stdout
 if " 16." not in run(pg/"postgres","--version"):raise RuntimeError("PG16_REQUIRED")
 with tempfile.TemporaryDirectory(prefix="clan-combined-",dir="/tmp") as tmp:
  t=pathlib.Path(tmp).resolve();app=t/"app";app.mkdir(mode=0o700)
  for n,digest in PINS.items():
   raw=(a.we1_image if n=="clan-image-install.sql" else a.we1_reader/n).read_bytes()
   if hashlib.sha256(raw).hexdigest()!=digest:raise RuntimeError("WE1_FIXTURE_PIN_MISMATCH:"+n)
   (app/n).write_bytes(raw)
  for n in ("socialWriterSession.mjs","socialClanReaderCore.mjs","socialClanImageCore.mjs","restrictedClanImageStorage.mjs"):
   shutil.copyfile(ROOT/"lib"/n,app/n)
  shutil.copyfile(ROOT/"tests/clan-hall-fixture/combined-clan-integration.mjs",app/"combined-clan-integration.mjs")
  (app/"node_modules").symlink_to((ROOT/"node_modules").resolve(strict=True),target_is_directory=True)
  sock=t/"s";sock.mkdir(mode=0o700);data=t/"data";port=45000+os.getpid()%10000
  run(pg/"initdb","-D",data,"--auth-local=trust","--auth-host=reject")
  started=False
  try:
   run(pg/"pg_ctl","-D",data,"-o",f"-h '' -k {sock} -p {port}","-l",t/"log","-w","start");started=True
   for db,f in [("postgres","fixture.sql"),("aoe2hd_db","install.sql")]:
    run(pg/"psql","-X","-qAt","-v","ON_ERROR_STOP=1","-h",sock,"-p",port,"-d",db,"-f",app/f)
   # Align the synthetic reader fixture with the additional existing image-table column.
   run(pg/"psql","-X","-qAt","-v","ON_ERROR_STOP=1","-h",sock,"-p",port,"-d","aoe2hd_db","-c","ALTER TABLE clan_message_attachments ADD COLUMN created_at timestamp")
   run(pg/"psql","-X","-qAt","-v","ON_ERROR_STOP=1","-h",sock,"-p",port,"-d","aoe2hd_db","-f",app/"clan-image-install.sql")
   run("node","combined-clan-integration.mjs",cwd=app,extra={"CLAN_TEST_SOCKET":str(sock),"CLAN_TEST_PORT":str(port),"CLAN_TEST_ADMIN":pwd.getpwuid(os.getuid()).pw_name})
  finally:
   if started:run(pg/"pg_ctl","-D",data,"-m","fast","-w","stop")
 print("CLAN_HALL_REAL_PG16_FIXTURE_COMPLETE",flush=True)
if __name__=="__main__":main()
