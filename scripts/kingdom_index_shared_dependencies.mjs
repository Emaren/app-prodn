/**
 * Bounded shared-source closure for the six public Kingdom instrument pages.
 *
 * The ordinary Kingdom Index source census is route-local, not a full import
 * graph. These six wrappers all import the same shared instrument UI; its
 * direct source subtree must therefore fingerprint each importing route.
 * The HEAD-pinned importer census refuses changes to the importer set until
 * an engineer explicitly reviews and revises the contract.
 *
 * This is NOT full transitive dependency analysis or a quality score.
 */
export const INSTRUMENT_IMPORT = "@/components/kingdom-instruments/KingdomInstruments";
export const INSTRUMENT_SOURCE_PREFIX = "components/kingdom-instruments/";

export const INSTRUMENT_CONSUMER_PAGES = Object.freeze([
  "app/kingdom-recovery/page.tsx",
  "app/kingdom-sensors/page.tsx",
  "app/kingdom-systems/page.tsx",
  "app/kingdom-tests/page.tsx",
  "app/replay-laboratory/page.tsx",
  "app/wolo-machine/page.tsx",
]);

export function validateInstrumentImporters(foundPaths) {
  const actual = [...new Set(foundPaths)].sort();
  const expected = [...INSTRUMENT_CONSUMER_PAGES].sort();
  const missing = expected.filter((p) => !actual.includes(p));
  const unexpected = actual.filter((p) => !expected.includes(p));

  if (missing.length || unexpected.length) {
    throw new Error(
      "KINGDOM INDEX SHARED IMPORT DRIFT " +
        JSON.stringify({ missing, unexpected }),
    );
  }
}

export function sharedSourcePrefixesForHref(href) {
  const page = "app/" + href.replace(/^\//, "") + "/page.tsx";
  return INSTRUMENT_CONSUMER_PAGES.includes(page)
    ? [INSTRUMENT_SOURCE_PREFIX]
    : [];
}
