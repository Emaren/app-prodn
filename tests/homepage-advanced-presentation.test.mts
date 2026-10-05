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

test(
  "Featured warrior opening lineup survives hydration and prioritizes the first mobile card",
  () => {
    assert.doesNotMatch(
      homepage,
      /const initialLineup = curatedFeaturedWarriorOpening\(poolRef\.current, true\)/,
    );
    assert.match(
      homepage,
      /visibleWarriorsRef\.current\.forEach\(\(warrior, index\) => \{[\s\S]*lastWarriorBySlotRef\.current\[index\] = warrior\.key/,
    );
    assert.match(
      homepage,
      /\}, \[clearTimers\]\);[\s\S]*later\(rotateOnce, FEATURED_WARRIOR_FIRST_ROTATE_MS\)/,
    );
    assert.equal(
      (homepage.match(/fetchPriority=\{index === 0 \? "high" : "low"\}/g) || []).length,
      2,
    );
  },
);

test(
  "Featured warrior rotation never blanks a painted slot",
  () => {
    assert.match(homepage, /FEATURED_WARRIOR_ROTATE_MS = 12_000/);
    assert.match(homepage, /FEATURED_WARRIOR_FIRST_ROTATE_MS = 14_000/);
    assert.doesNotMatch(homepage, /FEATURED_WARRIOR_FADE_MS/);
    assert.doesNotMatch(homepage, /FEATURED_WARRIOR_HOLD_MS/);
    assert.doesNotMatch(homepage, /setFadingSlot/);
    assert.doesNotMatch(homepage, /will-change-\[opacity\]/);
    assert.doesNotMatch(homepage, /fadingSlot === index/);
    assert.match(
      homepage,
      /decodeFeaturedWarriorImage\(featuredWarriorImageSrc\(nextWarrior\)\)[\s\S]*setVisibleWarriors/,
    );
    assert.equal((homepage.match(/key=\{index\}/g) || []).length, 2);
    assert.equal(
      (homepage.match(/transition-transform duration-300 ease-out hover:-translate-y-0\.5/g) || []).length,
      2,
    );
    assert.match(homepage, /function BufferedFeaturedWarriorImage/);
    assert.match(homepage, /data-featured-warrior-image-buffer/);
    assert.match(homepage, /pendingSrcRef\.current/);
    assert.match(homepage, /imageStillMatchesExpectedSource/);
    assert.match(homepage, /image\.currentSrc \|\| image\.src/);
    assert.match(homepage, /image preload timed out/);
    assert.match(homepage, /featuredWarriorDecodeCache\.delete\(src\)/);
    assert.doesNotMatch(
      homepage,
      /decodeFeaturedWarriorImage\(featuredWarriorImageSrc\(nextWarrior\)\)[\s\S]*?\.catch\(\(\) => undefined\)[\s\S]*?\.then/,
    );
    assert.equal(
      (homepage.match(/<BufferedFeaturedWarriorImage/g) || []).length,
      2,
    );
    assert.doesNotMatch(homepage, /<FeaturedWarriorSubtitle key=/);
  },
);

test(
  "Featured warrior subtitle hydration is deterministic before cosmetic rotation",
  () => {
    assert.doesNotMatch(homepage, /julioFeaturedSubtitleCursor/);
    assert.match(homepage, /const \[julioLineIndex, setJulioLineIndex\] = useState\(0\)/);
    assert.match(homepage, /useEffect\(\(\) => \{[\s\S]*setJulioLineIndex\(Math\.floor\(Math\.random\(\) \* JULIO_FEATURED_SUBTITLE_LINES\.length\)\)[\s\S]*\}, \[isJulio\]\)/);
    assert.match(homepage, /const julioLine = isJulio \? julioFeaturedSubtitleLine\(warrior, julioLineIndex\) : null/);
    assert.match(homepage, /const avatarPool = randomize \? shuffleFeaturedWarriors\(realAvatarPool\) : realAvatarPool/);
    assert.match(homepage, /pickUnknownFeaturedWarrior\([\s\S]*?null,[\s\S]*?randomize[\s\S]*?\)/);
  },
);
