#!/usr/bin/env python3
"""Exact reviewed Wolo verifier + real SDK fixture + HD + isolated PostgreSQL.
Only disposable test state; no inherited production database or signer config.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import hashlib

ROOT = Path(__file__).resolve().parent.parent
SOURCE = "155fcf67fb2127a2227de5ea785e51bdbb0155c0"

def run(args, **kw):
    return subprocess.run(args, check=True, timeout=600, **kw)

with tempfile.TemporaryDirectory(prefix="hd-real-comet-") as tmp:
    root = Path(tmp).resolve()
    source = root / "wolo"
    local = os.environ.get("SATCHEL_TEST_WOLO_SOURCE")
    run(["git", "clone", "--quiet", "--no-checkout", local or "https://github.com/Emaren/wolochain.git", str(source)])
    run(["git", "checkout", "--quiet", "--detach", SOURCE], cwd=source)
    assert not subprocess.check_output(["git","status","--porcelain"],cwd=source)
    env = os.environ.copy()
    env.update({"GOTOOLCHAIN":"local","GOENV":"off","GOWORK":"off","GOFLAGS":"","CGO_ENABLED":"0","GOAMD64":"v1","TZ":"UTC"})
    for key in ["DATABASE_URL","DIRECT_URL","PGHOST","PGPORT","PGUSER","PGPASSWORD","PGDATABASE"]:
        env.pop(key,None)
    binary = root / "wolosatcheld"
    run(["go","build","-trimpath","-buildvcs=true","-tags=go1.27","-mod=readonly","-ldflags=-buildid=","-o",str(binary),"./cmd/wolosatcheld"],cwd=source,env=env)
    metadata = subprocess.check_output(["go","version","-m",str(binary)],text=True)
    assert "vcs.revision="+SOURCE in metadata and "vcs.modified=false" in metadata and "go1.24.6" in metadata
    # Modify only a TEST fixture after compiling the exact reviewed verifier.
    # Override the helper builder's memo BEFORE it creates the real signature.
    fixture = source / "internal/satchel/isolated_execution_test.go"
    text = fixture.read_text().replace('"context"','"context"\n "github.com/cosmos/cosmos-sdk/client"')
    text = text.replace('application.TxConfig(), []sdk.Msg', 'hdMemoConfig{application.TxConfig(),f.intent.OwnerID}, []sdk.Msg')
    text += '''
type hdMemoConfig struct {client.TxConfig; owner string}
func (c hdMemoConfig) NewTxBuilder() client.TxBuilder { return hdMemoBuilder{c.TxConfig.NewTxBuilder(),"aoe2war/satchel/v1/"+c.owner+"/abcdefghijklmnop"} }
type hdMemoBuilder struct {client.TxBuilder; memo string}
func (b hdMemoBuilder) SetMemo(_ string) { b.TxBuilder.SetMemo(b.memo) }
'''
    assert 'hdMemoConfig{application.TxConfig()' in text
    fixture.write_text(text)
    env.update({"SATCHEL_PROOF_FIXTURE_DIR":str(root),"RUN_SATCHEL_REAL_CREDIT_TESTS":"1","SATCHEL_TEST_BINARY":str(binary),"SATCHEL_TEST_BINARY_SHA256":hashlib.sha256(binary.read_bytes()).hexdigest()})
    run(["go","test","-tags=go1.27","./internal/satchel","-run","^TestAuthenticatedProofFromIsolatedSDKExecution$","-count=1"],cwd=source,env=env)
    run(["node","--experimental-strip-types","--experimental-loader","./scripts/aoe2-alias-loader.mjs","--experimental-loader","./tests/fixtures/satchel-credit-test-loader.mjs","--disable-warning=MODULE_TYPELESS_PACKAGE_JSON","--test","tests/war-satchel-deposit-real-verifier.test.mts"],cwd=ROOT,env=env)
