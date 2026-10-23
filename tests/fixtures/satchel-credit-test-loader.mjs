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
  if(process.env.RUN_SATCHEL_FULL_LIFECYCLE_TESTS === '1' && url.endsWith('/lib/hdFinancialMaintenanceFence.ts')){
    // Synthetic operator/build/filesystem authority and private Unix transport;
    // actual Ed25519 policy, restricted PG role and lease kernel are retained.
    const start=source.indexOf('export async function withHdFinancialLease');
    if(start<0)throw Error('maintenance fixture kernel entrypoint missing');
    source=source.slice(0,start)+`export async function withHdFinancialLease(input,action){
      const fixture=JSON.parse(process.env.SATCHEL_TEST_FINANCIAL_AUTHORITY||"null");
      if(!fixture||!(fixture.socket.startsWith("/tmp/aoe2-satchel-lifecycle-")||fixture.socket.startsWith("/private/tmp/aoe2-satchel-lifecycle-")))throw Error("isolated financial policy missing");
      const a=fixture.authority;
      return withConfiguredLease(new pg.Client({host:fixture.socket,port:5432,user:a.readerRole,database:"postgres"}),a,input,action);
    }`;
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
