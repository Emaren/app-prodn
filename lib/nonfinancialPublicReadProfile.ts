/**
 * Exact R25 production isolation boundary for the deliberately limited public
 * display read model. Generic preview and legacy 3030 must never infer this.
 */
export function isNonfinancialPublicReadProfile(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.NODE_ENV === "production" &&
    env.AOE2WAR_R25_ISOLATED_WEB === "true" &&
    env.AOE2WAR_RUNTIME_PROFILE === "nonfinancial-production-v1" &&
    env.AOE2WAR_PROD_DB_PREVIEW !== "true" &&
    env.WARGRAPH_RUNTIME_DISABLED === "true";
}
