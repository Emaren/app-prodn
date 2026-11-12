#!/usr/bin/env python3
"""Resume the already-partially-installed Steam V23 repair; single owner action.

Previous install copied exact helper but held before service switch. This script
does not rerun enrollment: it verifies that precise partial state, atomically
replaces only the flawed root helper, then proves the root inspect before making
one Steam-only systemd ExecStart override. On HOLD, restore original helper and
the original service override state. No website or FINANCIAL mutations.
"""
from __future__ import annotations
import hashlib, json, os, pathlib, re, stat, subprocess, sys

P=pathlib.Path
HOME=P("/home/tony/.aoe2war-b-release-4c14-stage-20261112")
NEW_SOURCE=HOME/"r25_steam_refresh_current_product_v23_fixed.py"
NEW_SHA="fce433d0aa78ba3c3d85ffe87d8f30920f4d39687782f9881d4b5a8cae336908"
LIVE=P("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_current_product_v23.py")
OLD_SHA="5ae0d611f78fa5d3d2da453ddf18a6f8ebd7c5c026d342393e90d6f0057156a7"
ROOT=P("/root/.aoe2war-steam-v23-owner-install-4c14")
BACKUP=ROOT/"original_failed_v23_helper.py"
DROP=P("/etc/systemd/system/aoe2war-steam-egress-refresh.service.d/60-current-product-v23.conf")
DROP_DATA=(b"[Service]\nExecStart=\nExecStart=/usr/bin/python3 -I -B "+
           str(LIVE).encode()+b" --phase refresh\n")
DROP_SHA=hashlib.sha256(DROP_DATA).hexdigest()
WEB_UNIT=P("/etc/systemd/system/aoe2hdbets-web-prod.service")
WEB_SHA="b92af7e6c17ba12ee918bbce38cdb8c156fbaf06bd5fcb807206dd7763887962"
STEAM_UNIT=P("/etc/systemd/system/aoe2war-steam-egress-refresh.service")
STEAM_SHA="44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a"
PREVIOUS_V22=P("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_two_web_builds_v22.py")
PREVIOUS_V22_SHA="c6e633538fc17dad6fe887452516cb2ba1095855a0aab6f4bdda47f5985f6edc"
BOOT="6fdc01cb-8eb6-448d-9a5a-b62b66e0fe34"
SERVICE="aoe2war-steam-egress-refresh.service"
WEB="aoe2hdbets-web-prod.service"
TIMER="aoe2war-steam-egress-refresh.timer"

def require(ok,code):
    if not ok: raise RuntimeError("HOLD:"+code)

def sha(p):
    h=hashlib.sha256()
    with p.open("rb") as f:
        for b in iter(lambda:f.read(1048576),b""):h.update(b)
    return h.hexdigest()

def pinned(p,expected,owner,mode):
    st=p.lstat()
    require(stat.S_ISREG(st.st_mode) and st.st_uid==owner and
            st.st_nlink==1 and stat.S_IMODE(st.st_mode)==mode
            and sha(p)==expected,"PIN_"+p.name.replace(".","_").upper())

def run(argv,timeout=25):
    p=subprocess.run(argv,capture_output=True,text=True,timeout=timeout)
    if p.returncode:
        reason=None
        for line in reversed(p.stdout.splitlines()):
            try:
                obj=json.loads(line)
                why=obj.get("reason")
                if isinstance(why,str) and re.fullmatch(r"(?:HOLD:)?[A-Z0-9_]{3,100}",why):
                    reason=why
                    break
            except (ValueError,TypeError,AttributeError):
                pass
        raise RuntimeError(reason or "HOLD:COMMAND_"+argv[0].rsplit("/",1)[-1].upper())
    return p.stdout.strip()

def show(unit,field):
    return run(["/usr/bin/systemctl","show",unit,"-p",field,"--value"],15)

def syncdir(path):
    fd=os.open(str(path),os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)

def create_new(p,data,mode):
    fd=os.open(str(p),os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,"wb") as out:
        out.write(data);out.flush();os.fsync(out.fileno())
    os.chmod(p,mode)
    syncdir(p.parent)

def replace_exact(p,data,mode,tmp_name):
    tmp=p.with_name(tmp_name)
    require(not os.path.lexists(tmp),"TEMP_REPLACEMENT_ALREADY_EXISTS")
    create_new(tmp,data,mode)
    os.replace(tmp,p)
    syncdir(p.parent)

def preflight():
    require(os.geteuid()==0 and os.environ.get("SUDO_UID")=="1000" and
            os.environ.get("SUDO_USER")=="tony" and os.isatty(0) and
            os.isatty(1),"OWNER_INTERACTIVE_ROOT_REQUIRED")
    require(os.uname().nodename=="ubuntu-4gb-hel1-11","HOST_DRIFT")
    require(P("/proc/sys/kernel/random/boot_id").read_text().strip()==BOOT,
            "HOST_REBOOTED")
    require(ROOT.is_dir() and not ROOT.is_symlink() and
            ROOT.stat().st_uid==0 and
            stat.S_IMODE(ROOT.stat().st_mode)==0o700,
            "ORIGINAL_PARTIAL_ROOT_RECEIPT_MISSING")
    require(not os.path.lexists(BACKUP),"RESUME_ALREADY_USED")
    for p,value in (
        (ROOT/"original_web_unit_sha256",WEB_SHA),
        (ROOT/"original_steam_unit_sha256",STEAM_SHA)):
        pinned(p,hashlib.sha256((value+"\n").encode()).hexdigest(),0,0o400)
    pinned(NEW_SOURCE,NEW_SHA,1000,0o644)
    pinned(LIVE,OLD_SHA,0,0o500)
    pinned(WEB_UNIT,WEB_SHA,0,0o644)
    pinned(STEAM_UNIT,STEAM_SHA,0,0o644)
    pinned(PREVIOUS_V22,PREVIOUS_V22_SHA,0,0o644)
    require(not os.path.lexists(DROP),"CURRENT_STEAM_OVERRIDE_ALREADY_INSTALLED")
    current=show(SERVICE,"ExecStart")
    require(str(PREVIOUS_V22) in current and str(LIVE) not in current,
            "STEAM_EFFECTIVE_PREIMAGE_DRIFT")
    require(show(TIMER,"ActiveState")=="active","STEAM_TIMER_NOT_ACTIVE")
    require(show(WEB,"ActiveState")=="active" and
            show(WEB,"WorkingDirectory")==
            "/var/lib/aoe2war-web-prod-4c14cbc7c518","PUBLIC_WEB_CHANGED")
    before=show(WEB,"MainPID")
    require(before.isdecimal() and int(before)>100,"WEB_PID_INVALID")
    return before

def restore_preimage(original):
    # No changes to website, Steam accounts, wallet, or old unit at any point.
    try:
        if os.path.lexists(DROP):
            if sha(DROP)==DROP_SHA:
                DROP.unlink()
                syncdir(DROP.parent)
            else:
                print("HOLD:UNKNOWN_STEAM_DROP_IN_REFUSING_DELETE",flush=True)
                return
        if sha(LIVE)==NEW_SHA:
            replace_exact(LIVE,original,0o500,
                          ".r25_steam_v23_restore_prior_owner.tmp")
        elif sha(LIVE)!=OLD_SHA:
            print("HOLD:UNKNOWN_ROOT_HELPER_REFUSING_RESTORE",flush=True)
            return
        run(["/usr/bin/systemctl","daemon-reload"],25)
        pinned(LIVE,OLD_SHA,0,0o500)
        require(str(PREVIOUS_V22) in show(SERVICE,"ExecStart"),
                "STEAM_EXECSTART_NOT_RESTORED")
        print("PASS:ORIGINAL_V22_SERVICE_AND_PRIOR_HELPER_RESTORED",flush=True)
    except Exception as e:
        print("HOLD:INVERSE_FAILED_"+type(e).__name__.upper(),flush=True)

def install():
    old=LIVE.read_bytes()
    require(hashlib.sha256(old).hexdigest()==OLD_SHA,"PRIOR_HELPER_CHANGED")
    new=NEW_SOURCE.read_bytes()
    require(hashlib.sha256(new).hexdigest()==NEW_SHA,"CANDIDATE_SOURCE_CHANGED")
    create_new(BACKUP,old,0o400)
    pinned(BACKUP,OLD_SHA,0,0o400)
    print("PASS:EXACT_PREVIOUS_FAILED_HELPER_INVERSE_PRESERVED",flush=True)
    changed=False
    try:
        replace_exact(LIVE,new,0o500,".r25_steam_v23_owner_repaired.tmp")
        changed=True
        pinned(LIVE,NEW_SHA,0,0o500)
        print("PASS:CORRECTED_ROOT_HEL1_NODE_PROCESS_IDENTITY",flush=True)
        # Root-context identity/finance inspection must pass before any service
        # configuration or nft changes.
        result=run(["/usr/bin/python3","-I","-B",str(LIVE),
                    "--phase","inspect"],30)
        obj=json.loads(result.splitlines()[-1])
        require(obj.get("status")=="PASS_EXACT_NONFINANCIAL_WEB_SOURCE"
                and obj.get("finance_authorized") is False
                and obj.get("firewall_changed") is False,
                "ROOT_WEB_INSPECT_DID_NOT_PASS")
        print("PASS:ROOT_NONFINANCIAL_WEB_SOURCE_INSPECT",flush=True)
        require(show(WEB,"MainPID")==before and show(WEB,"ActiveState")=="active",
                "WEB_CHANGED_BEFORE_FIREWALL_REFRESH")
        create_new(DROP,DROP_DATA,0o644)
        pinned(DROP,DROP_SHA,0,0o644)
        run(["/usr/bin/systemctl","daemon-reload"],25)
        effective=show(SERVICE,"ExecStart")
        require(str(LIVE) in effective and "--phase refresh" in effective,
                "STEAM_OVERRIDE_NOT_EFFECTIVE")
        # Normal systemd service executes using EXISTING NNP/caps/UID/firewall
        # restrictions, not this unsandboxed owner process.
        run(["/usr/bin/systemctl","reset-failed",SERVICE],15)
        run(["/usr/bin/systemctl","start",SERVICE],150)
        require(show(SERVICE,"Result")=="success"
                and show(SERVICE,"ExecMainStatus")=="0",
                "STEAM_REFRESH_SERVICE_NOT_SUCCESSFUL")
        require(show(TIMER,"ActiveState")=="active","STEAM_TIMER_STOPPED")
        require(show(WEB,"ActiveState")=="active"
                and show(WEB,"MainPID")==before,"WEB_RESTARTED")
        pinned(LIVE,NEW_SHA,0,0o500)
        pinned(DROP,DROP_SHA,0,0o644)
        pinned(WEB_UNIT,WEB_SHA,0,0o644)
        pinned(STEAM_UNIT,STEAM_SHA,0,0o644)
        print("PASS:STEAM_V23_LIVE_REFRESH_ACCEPTED",flush=True)
        print("PASS:STEAM_ONLY_NFT_SERVICE_SUCCESS_FINANCE_MASKED",flush=True)
        print("PASS:3032_PUBLIC_WEBSITE_UNCHANGED",flush=True)
        print("HOLD:REAL_EMAREN_CALLBACK_OWNER_BROWSER_NOT_YET_VERIFIED",flush=True)
        return 0
    except Exception as e:
        print("HOLD:STEAM_RESUME_STAGE:"+str(e)
              if re.fullmatch(r"HOLD:[A-Z0-9_]{3,100}",str(e))
              else "HOLD:STEAM_RESUME_STAGE:"+type(e).__name__,flush=True)
        if changed:
            restore_preimage(old)
        return 3

def main():
    if sys.argv[1:]!=["resume"]:
        print("HOLD:EXACT_OWNER_RESUME_ACTION_ONLY");return 3
    try:
        global before
        before=preflight()
        return install()
    except Exception as e:
        why=str(e)
        if re.fullmatch(r"HOLD:[A-Z0-9_]{3,100}",why):
            print(why,flush=True)
        else:print("HOLD:OWNER_RESUME_"+type(e).__name__.upper(),flush=True)
        return 3

if __name__=="__main__":
    sys.exit(main())
