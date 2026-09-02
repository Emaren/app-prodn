import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

function read(
  filePath: string,
) {
  return readFileSync(
    new URL(
      `../${filePath}`,
      import.meta.url,
    ),
    "utf8",
  );
}

test(
  "Command Tower GET rails do not run repair mutations in live production read-only preview",
  () => {
    for (
      const filePath of [
        "app/api/admin/users/route.ts",
        "app/api/admin/users/rails/route.ts",
      ]
    ) {
      const source =
        read(
          filePath,
        );

      assert.match(
        source,
        /isLiveProductionReadOnlyPreview/,
      );

      assert.match(
        source,
        /if \(!isLiveProductionReadOnlyPreview\(\)\) \{[\s\S]*refreshRecoverableBetStakeIntents/,
      );
    }
  },
);
