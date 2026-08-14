import Link from "next/link";

import type {
  OgBoardEntry,
  OgBoardPlayer,
} from "@/lib/ogBoard";
import { normalizePublicReplayText } from "@/lib/unresolvedWatcherResult";

function formatDuration(
  totalSeconds: number,
): string {
  const hours = Math.floor(
    totalSeconds / 3600,
  );
  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );
  const secs =
    totalSeconds % 60;

  if (
    hours > 0 &&
    minutes > 0 &&
    secs > 0
  ) {
    return `${hours} hours ${minutes} minutes ${secs} seconds`;
  }

  if (
    hours > 0 &&
    minutes > 0
  ) {
    return `${hours} hours ${minutes} minutes`;
  }

  if (hours > 0) {
    return `${hours} hours`;
  }

  if (
    minutes > 0 &&
    secs > 0
  ) {
    return `${minutes} minutes ${secs} seconds`;
  }

  if (minutes > 0) {
    return `${minutes} minutes`;
  }

  return `${secs} seconds`;
}

function sanitizeDuration(
  seconds: number,
): number {
  if (
    seconds > 4 * 3600 ||
    seconds < 10
  ) {
    return 0;
  }

  return seconds;
}

function PremiumStats() {
  return (
    <span className="italic text-gray-400">
      Premium Stats
    </span>
  );
}

function OgPlayerBlock({
  player,
}: {
  player: OgBoardPlayer;
}) {
  const civilization =
    normalizePublicReplayText(
      player.civilization,
    ) ?? "Unknown";

  return (
    <div
      className={`rounded-lg p-4 ${
        player.winner
          ? "bg-gray-500 font-bold text-black"
          : "bg-gray-600 text-black"
      }`}
    >
      <p>
        <strong>Name:</strong>{" "}
        <Link
          href={player.href}
          className="hover:underline"
        >
          {player.name}
        </Link>{" "}
        {player.winner ? (
          <span className="font-bold text-yellow-300">
            🏆
          </span>
        ) : (
          <span className="italic text-red-400">
            ❌
          </span>
        )}
      </p>

      <p>
        <strong>
          Civilization:
        </strong>{" "}
        {civilization}
      </p>

      <p>
        <strong>
          Military Score:
        </strong>{" "}
        <PremiumStats />
      </p>

      <p>
        <strong>
          Economy Score:
        </strong>{" "}
        <PremiumStats />
      </p>

      <p>
        <strong>
          Technology Score:
        </strong>{" "}
        <PremiumStats />
      </p>

      <p>
        <strong>
          Society Score:
        </strong>{" "}
        <PremiumStats />
      </p>

      <p>
        <strong className="italic">
          More:
        </strong>{" "}
        <PremiumStats />
      </p>
    </div>
  );
}

export function OgBattleCard({
  entry,
  latest,
}: {
  entry: OgBoardEntry;
  latest: boolean;
}) {
  const gameVersion =
    normalizePublicReplayText(
      entry.gameVersion,
    ) ?? "Unknown";

  const mapName =
    normalizePublicReplayText(
      entry.mapName,
    ) ?? "Unknown";

  const gameType =
    normalizePublicReplayText(
      entry.gameType,
    ) ?? "Unknown";

  const cleanedDuration =
    sanitizeDuration(
      entry.durationSeconds ?? 0,
    );

  const hasWinner =
    entry.players.some(
      (player) =>
        player.winner,
    );

  return (
    <article
      className={`rounded-xl p-6 shadow-lg transition-all [content-visibility:auto] [contain-intrinsic-size:auto_36rem] ${
        latest
          ? "border-2 border-yellow-500 bg-gray-900 text-yellow-400"
          : "border border-gray-600 bg-gray-700 text-black"
      }`}
    >
      <h3 className="text-2xl font-semibold">
        {latest
          ? "🔥 Latest Match"
          : "Previous Match"}
      </h3>

      <p className="text-lg">
        <strong>
          Game Version:
        </strong>{" "}
        {gameVersion}
      </p>

      <p className="text-lg">
        <strong>Map:</strong>{" "}
        {mapName}
      </p>

      <p className="text-lg">
        <strong>
          Game Type:
        </strong>{" "}
        {gameType}
      </p>

      <p className="text-lg">
        <strong>
          Duration:
        </strong>{" "}
        {cleanedDuration === 0
          ? "⚠️ Invalid Duration (Likely Out of Sync)"
          : formatDuration(
              cleanedDuration,
            )}
      </p>

      <h4 className="mt-4 text-xl font-semibold">
        Players
      </h4>

      <div className="mt-2 space-y-2">
        {entry.players.map(
          (player, index) => (
            <OgPlayerBlock
              key={`${entry.id}:${player.name}:${index}`}
              player={player}
            />
          ),
        )}
      </div>

      {!hasWinner ? (
        <p className="mt-4 italic text-red-500">
          ⚠️ No winner detected in this replay.
        </p>
      ) : null}
    </article>
  );
}
