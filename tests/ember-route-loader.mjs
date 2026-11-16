// Test-only bridge to the genuine Next.js route handlers in Node's ESM test
// runtime; production uses Next's resolver. No application resolver is changed.
import { resolve as projectResolve } from "../scripts/aoe2-alias-loader.mjs";
export async function resolve(specifier, context, nextResolve) {
  if (/^next\/[a-z-]+$/.test(specifier)) {
    return projectResolve(specifier + ".js", context, nextResolve);
  }
  try {
    return await projectResolve(specifier, context, nextResolve);
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND" ||
        !specifier.startsWith(".") || /\.[cm]?[jt]s$/.test(specifier)) throw error;
    // TypeScript source imports without extensions, supported by Next bundles.
    for (const ext of [".ts", ".mts", ".js", ".mjs"]) {
      try { return await projectResolve(specifier + ext, context, nextResolve); }
      catch (candidateError) {
        if (candidateError?.code !== "ERR_MODULE_NOT_FOUND") throw candidateError;
      }
    }
    throw error;
  }
}
