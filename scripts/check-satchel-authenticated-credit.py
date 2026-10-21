#!/usr/bin/env python3
"""Exact reviewed Wolo verifier + real SDK fixture + HD + isolated PostgreSQL.
Only disposable test state; no inherited production database or signer config.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
SOURCE = "99f32de617964565875ed4689bea0d688bb99147"
# The reviewed PR #39 custody-backend artifact, not the historical PR #29
# financial-proof binary. Native macOS tests compile this same clean source;
# Linux AMD64 CI must reproduce the reviewed production byte identity too.
LINUX_AMD64_SHA256 = "d431c580a47ff020d997534145c5c53959c70c6f2d00d13029582ee8ec8709ac"

def run(args, **kw):
    return subprocess.run(args, check=True, timeout=600, **kw)


def isolated_sdk_transfer(source: str, amount_uwolo: int, genesis_uwolo: int) -> str:
    """Change ONLY the disposable Go test fixture, not the pinned verifier.

    The real SDK ante fee remains one uwolo and the isolated sender retains
    2,999,999 uwolo after each separately authenticated execution. Neither
    fixture is continuous chain state or an authorization to fund mainnet.
    """
    assert amount_uwolo in (100_000_000, 12_000_000)
    assert genesis_uwolo == amount_uwolo + 3_000_000
    for original, replacement in [
        ("sdkmath.NewInt(10000000)", f"sdkmath.NewInt({genesis_uwolo})"),
        ("sdk.NewInt64Coin(Denom, 7000000)", f"sdk.NewInt64Coin(Denom, {amount_uwolo})"),
        ('require.Equal(t, "7000000"', f'require.Equal(t, "{amount_uwolo}"'),
        ('f.intent.AmountUWolo = "7000000"', f'f.intent.AmountUWolo = "{amount_uwolo}"'),
    ]:
        assert source.count(original) == 1, f"unexpected pinned fixture source for {original}"
        source = source.replace(original, replacement)
    assert "sdk.NewInt64Coin(Denom, 1)" in source, "SDK ante fee fixture must remain unchanged"
    return source


with tempfile.TemporaryDirectory(prefix="hd-real-comet-") as tmp:
    root = Path(tmp).resolve()
    source = root / "wolo"
    local = os.environ.get("SATCHEL_TEST_WOLO_SOURCE")
    run(["git", "clone", "--quiet", "--no-checkout", local or "https://github.com/Emaren/wolochain.git", str(source)])
    run(["git", "checkout", "--quiet", "--detach", SOURCE], cwd=source)
    assert not subprocess.check_output(["git","status","--porcelain"],cwd=source)
    env = os.environ.copy()
    env.update({"GOTOOLCHAIN":"local","GOENV":"off","GOWORK":"off","GOFLAGS":"","CGO_ENABLED":"0","GOAMD64":"v1","GOEXPERIMENT":"","GOFIPS140":"off","GIT_NO_REPLACE_OBJECTS":"1","TZ":"UTC"})
    for key in ["DATABASE_URL","DIRECT_URL","PGHOST","PGPORT","PGUSER","PGPASSWORD","PGDATABASE","GODEBUG","GOOS","GOARCH"]:
        env.pop(key,None)
    binary = root / "wolosatcheld"
    run(["go","build","-trimpath","-buildvcs=true","-tags=go1.27","-mod=readonly","-ldflags=-buildid=","-o",str(binary),"./cmd/wolosatcheld"],cwd=source,env=env)
    metadata = subprocess.check_output(["go","version","-m",str(binary)],text=True)
    assert "vcs.revision="+SOURCE in metadata and "vcs.modified=false" in metadata and "go1.24.6" in metadata
    binary_sha256 = hashlib.sha256(binary.read_bytes()).hexdigest()
    if "GOOS=linux" in metadata and "GOARCH=amd64" in metadata:
        assert binary_sha256 == LINUX_AMD64_SHA256, "reviewed Linux verifier checksum mismatch"
    # Import a disposable *test-only* source for four genuine sequential
    # Cosmos SDK signed sends in a single ephemeral application/chain.
    # This source is NOT part of the pinned mainnet verifier binary and must
    # NEVER be installed into a production WoloChain checkout.
    continuous_test = ROOT / "tests/fixtures/satchel-v1-continuous-sdk_test.go"
    assert continuous_test.is_file()
    (source / "internal/satchel/satchel_v1_continuous_sdk_test.go").write_bytes(continuous_test.read_bytes())
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
    fixture.write_text(isolated_sdk_transfer(text, 100_000_000, 103_000_000))
    env.update({"SATCHEL_PROOF_FIXTURE_DIR":str(root),"RUN_SATCHEL_REAL_CREDIT_TESTS":"1","SATCHEL_TEST_BINARY":str(binary),"SATCHEL_TEST_BINARY_SHA256":binary_sha256,
                "SATCHEL_LIFECYCLE_WOLO_SOURCE":str(source)})
    # The older transfer fixture maps SDK genesis to a synthetic Comet height;
    # it cannot provide a truthful IAVL balance proof. Use one actual aligned
    # SDK chain for both the 100-WOLO deposit and its current H=head-1 bank.
    deposit_recipe = root / "authenticated-deposit-recipe.json"
    deposit_recipe.write_text(json.dumps({"version":1,"scenario":"authenticated_deposit_current_bank","steps":[{
        "name":"deposit","sender_role":"owner","recipient_role":"vault","amount_uwolo":"100000000",
        "memo":"aoe2war/satchel/v1/lifecycle-owner/abcdefghijklmnop"}]}))
    env.update({"SATCHEL_LIFECYCLE_RECIPE":str(deposit_recipe),"SATCHEL_LIFECYCLE_FIXTURE_DIR":str(root)})
    run(["go","test","-tags=go1.27","./internal/satchel","-run","^TestAuthenticatedContinuousSDKLifecycle$","-count=1"],cwd=source,env=env)
    deposit_path = root / "authenticated_deposit_current_bank/isolated-sdk-lifecycle.json"
    genuine_deposit = json.loads(deposit_path.read_text())
    assert genuine_deposit["fixture_only"] is True and genuine_deposit["mainnet_authority"] is False
    assert genuine_deposit["steps"][0]["deposit_intent"]["AmountUWolo"] == "100000000", "wrong actual SDK deposit amount"
    env["SATCHEL_CREDIT_DEPOSIT_FIXTURE"] = str(deposit_path)
    run(["node","--experimental-strip-types","--experimental-loader","./scripts/aoe2-alias-loader.mjs","--experimental-loader","./tests/fixtures/satchel-credit-test-loader.mjs","--disable-warning=MODULE_TYPELESS_PACKAGE_JSON","--test","tests/war-satchel-deposit-real-verifier.test.mts"],cwd=ROOT,env=env)
    # A SECOND genuine SDK execution exercises the operation/wager contract.
    # Change only the disposable test builder BEFORE it signs and commits;
    # the exact reviewed verifier compiled above remains untouched. The SDK's
    # real 1uwolo ante fee must agree with the independent test approval.
    deposit_memo = '"aoe2war/satchel/v1/"+c.owner+"/abcdefghijklmnop"'
    wager_memo = '"AoE2HDBets bet ticket v1 · ticket 1"'
    assert text.count(deposit_memo) == 1
    fixture.write_text(isolated_sdk_transfer(text.replace(deposit_memo, wager_memo), 12_000_000, 15_000_000))
    run(["go","test","-tags=go1.27","./internal/satchel","-run","^TestAuthenticatedProofFromIsolatedSDKExecution$","-count=1"],cwd=source,env=env)
    genuine_wager = json.loads((root / "isolated-sdk-proof.json").read_text())
    assert genuine_wager["fixture_only"] is True and genuine_wager["mainnet_authority"] is False
    assert genuine_wager["intent"]["AmountUWolo"] == "12000000", "wrong actual SDK wager amount"
    run(["node","--experimental-strip-types","--experimental-loader","./scripts/aoe2-alias-loader.mjs","--experimental-loader","./tests/fixtures/satchel-credit-test-loader.mjs","--disable-warning=MODULE_TYPELESS_PACKAGE_JSON","--test","tests/war-satchel-wager-real-verifier.test.mts"],cwd=ROOT,env=env)

    # One chain, four sequential SDK transactions with independent fee budget:
    # 100 deposit -> 12 escrow -> 12 no-fee principal return -> 100 withdrawal.
    # A second fixture proves a 1uwolo gas shortage prevents full payout.
    # Real Cosmos SDK execution, but NOT a light-client/Comet finality proof
    # for the continuous session and not connected to the Prisma ledger.
    run(["go","test","-tags=go1.27","./internal/satchel",
         "-run","^TestSatchelV1ContinuousIsolatedSDKFeeConservation$",
         "-count=1"],cwd=source,env=env)

    # Explicit isolated-test opt-in: actual Prisma writers consume real SDK
    # transfer/bank proofs through the same exact native verifier, across the
    # canonical Watcher ticket, return and withdrawal application lifecycle.
    env["RUN_SATCHEL_FULL_LIFECYCLE_TESTS"] = "1"
    run(["node","--experimental-strip-types","--experimental-loader","./scripts/aoe2-alias-loader.mjs",
         "--experimental-loader","./tests/fixtures/satchel-credit-test-loader.mjs",
         "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON","--test",
         "tests/war-satchel-continuous-funded-lifecycle.test.mts"],cwd=ROOT,env=env)
