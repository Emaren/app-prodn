#!/usr/bin/env bash
# C R16 exact-source HEL1 PLAN. This wrapper DOES NOT implement INSTALL.
# Usage after independent F/C final-head review ONLY:
# bash r16_hel1_root_plan_only.sh <FINAL_F_SHA40> <REVIEWED_INSTALLER_SHA256> \
#   <REVIEWED_MANIFEST_SHA256> <EXACT_STAGED_INSTALLER_PATH> \
#   <EXACT_STAGED_MANIFEST_PATH> <EXACT_STAGED_BUNDLE_PATH>
# No strict shell abort modes; every failure prints HOLD.
echo '=== C R16: ROOT HELPER EXACT SHA ONE-FD READ-ONLY PLAN ==='
if [ "$(uname -s)" != Linux ] ||
   [ "$(hostname -s)" != ubuntu-4gb-hel1-11 ] ||
   [ "$(id -u)" != 1000 ]; then
  echo 'HOLD: EXPECTED_NATIVE_HEL1_TONY_UID1000'
  exit 2
fi
if [ "$#" != 6 ]; then
  echo 'HOLD: EXACT_SIX_REVIEWED_SOURCE_ARGUMENTS_REQUIRED'
  exit 2
fi
/usr/bin/python3 - "$1" "$2" "$3" <<'PY'
import re,sys
f,s,m=sys.argv[1:]
if not re.fullmatch('[a-f0-9]{40}',f) or not re.fullmatch('[a-f0-9]{64}',s) or not re.fullmatch('[a-f0-9]{64}',m):
    raise SystemExit('HOLD: INVALID_FINAL_SOURCE_OR_SCRIPT_MANIFEST_PIN')
PY
if [ "$?" -ne 0 ]; then
  echo 'HOLD: INVALID_REVIEWED_SHA_FORMAT'
  exit 2
fi
sudo -n /usr/bin/python3 -I -B -c '
import hashlib,os,socket,stat,sys
script,expected_script,expected_manifest,final_sha,manifest,bundle=sys.argv[1:]
if os.geteuid()!=0 or sys.platform!="linux" or socket.gethostname()!="ubuntu-4gb-hel1-11":
    raise SystemExit("HOLD: WRONG_ROOT_HOST")
if not script.startswith("/home/tony/") or not os.path.isabs(manifest) or not os.path.isabs(bundle):
    raise SystemExit("HOLD: EXPECTED_STAGED_OWNER_INPUTS")
fd=os.open(script,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
try:
    s=os.fstat(fd)
    if not stat.S_ISREG(s.st_mode) or not 0<s.st_size<=131072:
        raise SystemExit("HOLD: REVIEWED_INSTALLER_TYPE_OR_LENGTH")
    data=os.read(fd,131073)
    after=os.fstat(fd)
    if len(data)!=s.st_size or (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
        raise SystemExit("HOLD: SOURCE_CHANGED_DURING_AUTHENTICATION")
finally:os.close(fd)
if hashlib.sha256(data).hexdigest()!=expected_script:
    raise SystemExit("HOLD: SOURCE_IS_NOT_INDEPENDENTLY_REVIEWED_INSTALLER")
sys.argv=[script,"plan","--controller-sha",final_sha,"--manifest",manifest,"--bundle",bundle,"--approved-manifest-sha256",expected_manifest]
exec(compile(data,script,"exec"),{"__name__":"__main__","__file__":script})
' "$4" "$2" "$3" "$1" "$5" "$6"
rc=$?
if [ "$rc" -eq 0 ]; then
  echo 'PASS: FINAL_F_SOURCE_PINNED_ROOT_PLAN_ONLY'
  echo 'INSTALL_AUTHORIZED=NO'
  echo 'SSH_KEYS_ENROLLED_BY_THIS_WRAPPER=NO'
else
  echo 'HOLD: FINAL_ROOT_PLAN_NOT_ADMITTED'
fi
exit "$rc"
