import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const profile =
  fs.readFileSync(
    "app/profile/page.tsx",
    "utf8"
  );

const shell =
  fs.readFileSync(
    "app/AppShell.tsx",
    "utf8"
  );

test(
  "Extreme profile owns the premium command-center surfaces",
  () => {
    for (
      const contract
      of [
        "Warrior command center",
        "Pair once.",
        "The Armory",
        "WOLO Ledger",
        "Upcoming Battles",
        "Career Record",
        "Your Room",
        "Wallet Rail",
        "Bounties",
      ]
    ) {
      assert.ok(
        profile.includes(
          contract
        ),
        `missing ${contract}`
      );
    }
  }
);

test(
  "Extreme profile keeps direct avatar selection",
  () => {
    assert.match(
      profile,
      /onClick=\{\(\) => onPreset\(option\.target\)\}/
    );

    assert.doesNotMatch(
      profile,
      /Confirm Avatar/
    );
  }
);

test(
  "Extreme profile gets 96rem shell while legacy modes self constrain",
  () => {
    assert.match(
      shell,
      /pathname === "\/profile"/
    );

    assert.match(
      shell,
      /max-w-\[96rem\]/
    );

    assert.match(
      profile,
      /isBasicProfileView \? "max-w-5xl" : "max-w-7xl"/
    );
  }
);

test(
  "Extreme ledger retains existing personal transaction rail",
  () => {
    assert.match(
      profile,
      /moneyRows=\{moneyRows\}/
    );

    assert.match(
      profile,
      /onMoneyScroll=\{handleMoneyScroll\}/
    );

    assert.match(
      profile,
      /<WoloTransactionLine/
    );
  }
);
