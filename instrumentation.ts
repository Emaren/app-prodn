export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NODE_ENV !== "production"
  ) {
    return;
  }

  const { startWarGraphRuntime } =
    await import("./lib/wargraph/runtime");

  startWarGraphRuntime();
}
