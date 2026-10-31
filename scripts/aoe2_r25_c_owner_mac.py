#!/usr/bin/env python3
"""R25 owner Mac to original root SSH: exact hash checked additive stage/build."""
import argparse,hashlib,os,pathlib,re,subprocess,sys,urllib.request
SHA="0cee3c836c4b0760478280c145e02e81e470ce0e"
PATH="scripts/aoe2_r25_c_parallel_stage.py"
HEX40=re.compile(r"[0-9a-f]{40}\Z")
HEX64=re.compile(r"[0-9a-f]{64}\Z")
class Hold(RuntimeError):pass
def need(cond,msg):
    if not cond:raise Hold(msg)
def own_archive_sha(repo):
    # Independent of the remote owner-uploaded tar. Standard Git archive.
    argv=["/usr/bin/git","-C",str(repo),"archive","--format=tar",SHA]
    h=hashlib.sha256()
    with subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE) as p:
        while True:
            block=p.stdout.read(1024*1024)
            if not block:break
            h.update(block)
        err=p.stderr.read()
        need(p.wait(timeout=90)==0,"MAC_EXACT_GIT_ARCHIVE_MISSING:"+err.decode(errors="replace")[-90:])
    return h.hexdigest()
def run(repo,commit,worker_hash,phase):
    need(sys.platform=="darwin" and os.geteuid()!=0,"OWNER_M1_NONROOT_REQUIRED")
    need(HEX40.fullmatch(commit) and HEX64.fullmatch(worker_hash),
         "C_REVIEW_COMMIT_AND_SOURCE_HASH_REQUIRED")
    repo=pathlib.Path(repo).expanduser().absolute()
    need(repo.is_dir() and (repo/".git").exists(),"OWNER_MAC_EXACT_REPO_REQUIRED")
    gitsha=subprocess.run(["/usr/bin/git","-C",str(repo),"cat-file","-t",SHA],
                          capture_output=True,timeout=15)
    need(gitsha.returncode==0 and gitsha.stdout.strip()==b"commit",
         "FROZEN_CANDIDATE_MISSING_ON_OWNER_MAC")
    url="https://raw.githubusercontent.com/Emaren/app-prodn/"+commit+"/"+PATH
    with urllib.request.urlopen(url,timeout=25) as response:
        source=response.read(65537)
    need(0<len(source)<=65536 and hashlib.sha256(source).hexdigest()==worker_hash,
         "ROOT_OPERATOR_PINNED_SHA256_MISMATCH")
    need(("SHA=\""+SHA+"\"").encode() in source,"TARGET_SOURCE_NOT_PINNED")
    archive=own_archive_sha(repo)
    phrase="AUTHORIZE R25 HEL1 "+phase.upper()+" "+SHA+" "+archive
    with open("/dev/tty","w") as tty:
        tty.write("Additive candidate only: old web PID 2625090 / 3030 NEVER restarted.\n")
        tty.write("Remote archive sha256 must match owner Mac canonical exact Git archive:\n"+archive+"\n")
        tty.write("Reviewed operator commit: "+commit+"\n")
        tty.write("Type EXACTLY:\n"+phrase+"\n> ")
        tty.flush()
    with open("/dev/tty","r") as tty:
        need(tty.readline().rstrip("\r\n")==phrase,"OWNER_STAGE_CONSENT_NOT_ENTERED")
    mode={"source":"--source-stage","build":"--build-stage",
          "source-build":"--source-build","recover-dns":"--recover-dns"}[phase]
    arg=mode+(" --archive-sha256 "+archive if phase not in ("build","recover-dns") else "")
    cmd=["/usr/bin/ssh","-T","-o","BatchMode=yes",
         "-o","StrictHostKeyChecking=yes","-o","NumberOfPasswordPrompts=0",
         "-o","ConnectTimeout=10","-o","ConnectionAttempts=1",
         "root@hel1","/usr/bin/python3 -I -B - "+arg]
    proc=subprocess.run(cmd,input=source,capture_output=True,timeout=4200)
    sys.stdout.buffer.write(proc.stdout);sys.stderr.buffer.write(proc.stderr)
    target=b"PASS:BUILD_STAGED" if phase in ("build","source-build","recover-dns") else b"PASS:SOURCE_STAGED"
    need(proc.returncode==0 and target in proc.stdout,
         "HEL1_STAGE_OR_BUILD_NOT_PROVEN_NO_BLIND_RETRY")
    print("PASS:R25_OWNER_MAC_STAGE_PHASE="+phase)
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--repo",default="~/projects/AoE2HDBets/app-prodn")
    p.add_argument("--review-commit",required=True)
    p.add_argument("--operator-sha256",required=True)
    p.add_argument("--phase",choices=["source","build","source-build","recover-dns"],default="source-build")
    a=p.parse_args()
    run(a.repo,a.review_commit,a.operator_sha256,a.phase)
if __name__=="__main__":
    try:main()
    except (Hold,OSError,ValueError,subprocess.SubprocessError,TimeoutError) as e:
        print("HOLD:R25_C_OWNER:"+str(e),file=sys.stderr);sys.exit(2)
