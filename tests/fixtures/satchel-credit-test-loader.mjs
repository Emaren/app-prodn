// Isolated integration-test dependency mock. Never imported by application code.
// The production hold stays literally false. Test DB connections use only a
// newly created private Unix socket, never DATABASE_URL or an external chain.
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (process.env.RUN_SATCHEL_REAL_CREDIT_TESTS !== '1') return result;
  let source = result.source?.toString();
  if (!source) return result;
  if (url.endsWith('/lib/warSatchelFinancialBridgeHold.ts')) {
    source = source.replace('SATCHEL_FINANCIAL_BRIDGE_READY = false as const', 'SATCHEL_FINANCIAL_BRIDGE_READY = true as const');
  }
  if ((url.endsWith('/lib/warSatchelAuthenticatedDeposit.ts') ||
       url.endsWith('/lib/warSatchelAuthenticatedFinancialProof.ts')) && process.platform !== 'linux') {
    // Native macOS test compile of the identical pinned Go source has different
    // bytes. Linux CI exercises the UNMODIFIED production artifact SHA pin.
    const digest = process.env.SATCHEL_TEST_BINARY_SHA256;
    if (!/^[a-f0-9]{64}$/.test(digest || '')) throw Error('test binary identity missing');
    source = source.replace('d431c580a47ff020d997534145c5c53959c70c6f2d00d13029582ee8ec8709ac', digest);
  }
  return {...result, source};
}
