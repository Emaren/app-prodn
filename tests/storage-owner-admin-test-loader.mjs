/** Test-only interception of the admin gate, not application trust config. */
export async function resolve(specifier,context,nextResolve){
  if(specifier==="@/lib/adminSession")
    return {url:new URL("./storage-owner-admin-fixture.mjs",import.meta.url).href,shortCircuit:true};
  return nextResolve(specifier,context);
}
