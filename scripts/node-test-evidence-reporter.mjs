/**
 * CI Node contract reporter: compact positive progress, actionable failure
 * identities. Node's built-in "dot" reporter prints failed filenames but
 * often suppresses the exact test and assertion location.
 *
 * This reporter never prints full assertion actual/expected objects or stack
 * dumps, which may include sensitive financial test fixtures.
 */
const MAX_FAILURES = 24;
const safe = (value, max) =>
  String(value ?? "").replace(/[\r\n\t]+/g, " ").slice(0, max);

export default async function* report(source) {
  let passed = 0;
  let failuresShown = 0;
  let failuresSuppressed = 0;
  let summarySeen = false;
  for await (const event of source) {
    const data = event.data ?? {};
    if (event.type === "test:pass") {
      passed += 1;
      if (passed % 100 === 0) yield `Node contract progress: ${passed} passed\n`;
    } else if (event.type === "test:fail") {
      const err = data.details?.error;
      // A failing parent with child failures is an aggregate, not another
      // failing assertion to show in the limited diagnostics.
      if (err?.failureType === "subtestsFailed") continue;
      if (failuresShown >= MAX_FAILURES) {
        failuresSuppressed += 1;
        continue;
      }
      const path = safe(data.file, 180);
      const location = `${path}:${Number.isInteger(data.line) ? data.line : "?"}:${Number.isInteger(data.column) ? data.column : "?"}`;
      const detail = safe(
        (err?.cause?.message ?? err?.message ?? "test failed").split("\n")[0],
        180,
      );
      const code = safe(err?.cause?.code ?? err?.code ?? "ERR_TEST_FAILURE", 60);
      yield `FAIL ${safe(data.name, 150)} (${location}) [${code}] ${detail}\n`;
      failuresShown += 1;
    } else if (event.type === "test:summary" && !data.file) {
      summarySeen = true;
      const counts = data.counts ?? {};
      yield `Node contract summary: ${counts.passed ?? passed} passed, ${counts.failed ?? "?"} failed, ${counts.skipped ?? 0} skipped, ${counts.cancelled ?? 0} cancelled\n`;
      if (failuresSuppressed) yield `${failuresSuppressed} additional failures omitted; first ${MAX_FAILURES} shown.\n`;
    }
  }
  if (!summarySeen) yield `Node contract stream ended without a final summary; ${passed} passes observed\n`;
}
