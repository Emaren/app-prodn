import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const homepage = readFileSync(
  new URL(
    "../app/HomePageClient.tsx",
    import.meta.url,
  ),
  "utf8",
);

const carousel = readFileSync(
  new URL(
    "../components/hero/HeroCarousel.tsx",
    import.meta.url,
  ),
  "utf8",
);

const lobbyHero = readFileSync(
  new URL(
    "../components/lobby/LobbyHero.tsx",
    import.meta.url,
  ),
  "utf8",
);

const leaderboardPanel =
  readFileSync(
    new URL(
      "../components/lobby/LeaderboardPanel.tsx",
      import.meta.url,
    ),
    "utf8",
  );

test(
  "Advanced homepage opts into fitted hero presentation",
  () => {
    assert.match(
      homepage,
      /presentation=\{[\s\S]*isAdvancedLobby[\s\S]*\? "advanced"[\s\S]*: "default"/,
    );
  },
);

test(
  "Advanced hero uses landscape full-image-safe geometry",
  () => {
    assert.match(
      carousel,
      /presentation === "advanced"/,
    );

    assert.match(
      carousel,
      /sm:aspect-\[3\/2\] sm:min-h-0/,
    );

    assert.match(
      carousel,
      /presentation === "advanced"[\s\S]*\? "contain"/,
    );
  },
);

test(
  "Advanced summary no longer contains duplicate lane toggle",
  () => {
    const start =
      lobbyHero.indexOf(
        'if (tileViewMode === "advanced")',
      );

    const end =
      lobbyHero.indexOf(
        "\n  return (",
        start,
      );

    const advancedBlock =
      lobbyHero.slice(
        start,
        end,
      );

    assert.match(
      advancedBlock,
      /grid gap-3 sm:grid-cols-2/,
    );

    assert.doesNotMatch(
      advancedBlock,
      /<LeaderboardLaneToggle/,
    );

    assert.match(
      advancedBlock,
      /laneToggleVariant="compact"/,
    );
  },
);

test(
  "LeaderboardPanel applies requested compact lane variant",
  () => {
    assert.match(
      leaderboardPanel,
      /laneToggleVariant\?: "card" \| "compact"/,
    );

    assert.match(
      leaderboardPanel,
      /laneToggleVariant = "card"/,
    );

    assert.match(
      leaderboardPanel,
      /variant=\{laneToggleVariant\}/,
    );
  },
);
