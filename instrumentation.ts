export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NODE_ENV === "production") {
      // Keep the WarGraph worker graph completely out of Edge and dev
      // instrumentation bundles.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { startWarGraphRuntime } = require("./lib/wargraph/runtime");

      startWarGraphRuntime();
    } else {
      // WarGraph background runtime is intentionally disabled in development.
    }
  } else {
    // Edge instrumentation intentionally has no Node-only dependencies.
  }
}
