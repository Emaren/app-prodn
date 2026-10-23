// Isolated integration-test dependency mock. Never imported by application code.
// The production hold stays literally false. Test DB connections use only a
// newly created private Unix socket, never DATABASE_URL or an external chain.
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (process.env.RUN_SATCHEL_REAL_CREDIT_TESTS !== '1') return result;
  let source = result.source?.toString();
  if (!source) return result;
  if (process.env.RUN_SATCHEL_FULL_LIFECYCLE_TESTS === '1' && url.endsWith('/lib/warSatchelAutoSpendConsent.ts')) {
    // A distinct signed test epoch, never a signature or authority bypass.
    // Existing production/held-era owner mandates remain unusable.
    const heldEpoch = 'aoe2war/satchel/mecha/v2/held-integration-1';
    if (source.split(heldEpoch).length !== 2) throw Error('exact held test epoch missing');
    source = source.replace(heldEpoch, 'aoe2war/satchel/mecha/v2/release/isolated-test-only');
  }
  if (process.env.RUN_SATCHEL_FULL_LIFECYCLE_TESTS === '1' && url.endsWith('/lib/bets.ts')) {
    // Exercise the actual canonical settlement writer without invoking the
    // broad production scheduler. This export exists only in this test loader.
    source += '\nexport {settleResolvedMarketWagers as settleIsolatedLifecycleMarkets};\n';
  }
  if (process.env.RUN_SATCHEL_FULL_LIFECYCLE_TESTS === '1' &&
      url.endsWith('/lib/hdFinancialMaintenanceFence.ts')) {
    // An explicitly scoped, synthetic lease permits the SECOND stage of the
    // isolated genuine-SDK withdrawal fixture, never real money. The FIRST
    // stage runs against production's unmodified default-HOLD behavior.
    const signature='export async function withHdFinancialLease<T>(input:HdFinancialAdmission,action:(signal:AbortSignal)=>Promise<T>):Promise<T>{';
    if (source.split(signature).length!==2) throw Error('isolated financial-lease seam moved');
    source=source.replace(signature,signature+`
  if (process.env.SATCHEL_CI_SYNTHETIC_WITHDRAWAL_LEASE === "local-fixture-only") {
    if(input.scope!=="hd-satchel" || input.producer!=="war-satchel-withdrawal" ||
      input.wallet!==process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS ||
      !/^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/.test(input.wallet))
      throw Error("CI_SYNTHETIC_FINANCIAL_LEASE_WRONG_SCOPE");
    return await action(new AbortController().signal);
  }
`);
  }
  if (url.endsWith('/lib/warSatchelFinancialBridgeHold.ts')) {
    source = source.replace('SATCHEL_FINANCIAL_BRIDGE_READY = false as const', 'SATCHEL_FINANCIAL_BRIDGE_READY = true as const');
  }
  if ((url.endsWith('/lib/warSatchelAuthenticatedDeposit.ts') ||
       url.endsWith('/lib/warSatchelAuthenticatedFinancialProof.ts')) && process.platform !== 'linux') {
    // Native macOS test compile of the identical pinned Go source has different
    // bytes. Linux CI exercises the UNMODIFIED production artifact SHA pin.
    const digest = process.env.SATCHEL_TEST_BINARY_SHA256;
    if (!/^[a-f0-9]{64}$/.test(digest || '')) throw Error('test binary identity missing');
    source = source.replace('4c69464e9f6bf46feffb96cfd9f242d40eabdb5fad514af7adf99d44397788b3', digest);
  }
  return {...result, source};
}
