import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const assetPolicy = fs.readFileSync(
  "lib/radioWoloAssets.ts",
  "utf8",
);

const adminRoute = fs.readFileSync(
  "app/api/admin/radio/assets/route.ts",
  "utf8",
);

const vault = fs.readFileSync(
  "components/admin/radio/RadioWoloVault.tsx",
  "utf8",
);

const submissionRoute = fs.readFileSync(
  "app/api/radio/submissions/route.ts",
  "utf8",
);

const submissionForm = fs.readFileSync(
  "components/radio/RadioSubmissionForm.tsx",
  "utf8",
);

test(
  "private Radio Vault accepts assets up to 250 MB",
  () => {
    assert.match(
      assetPolicy,
      /250 \* 1024 \* 1024/,
    );

    assert.match(
      adminRoute,
      /no larger than 250 MB/,
    );

    assert.match(
      vault,
      /250 MB max each/,
    );
  },
);

test(
  "public Radio submissions remain capped at 60 MB",
  () => {
    assert.match(
      submissionRoute,
      /60 \* 1024 \* 1024/,
    );

    assert.match(
      submissionRoute,
      /no larger than 60 MB/,
    );

    assert.match(
      submissionForm,
      /60 MB max/,
    );
  },
);
