"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface GameStatsHeaderProps {
  filterMode: "all" | "mine";
  setFilterMode: (mode: "all" | "mine") => void;
}

export default function GameStatsHeader({ filterMode, setFilterMode }: GameStatsHeaderProps) {
  const router = useRouter();

  return (
    <div className="text-center mt-8 space-y-4">
      <Button
        className="bg-blue-700 hover:bg-blue-700 px-6 py-3 text-white font-semibold"
        onClick={() => router.push("/")}
      >
        ⬅️ Back to Home
      </Button>

      <div className="flex gap-4 justify-center mt-4">
        <Button
          onClick={() => setFilterMode("mine")}
          className={filterMode === "mine" ? "bg-yellow-500" : "bg-gray-700"}
        >
          🎯 My Games
        </Button>
        <Button
          onClick={() => setFilterMode("all")}
          className={filterMode === "all" ? "bg-yellow-500" : "bg-gray-700"}
        >
          🌎 All Games
        </Button>
      </div>
    </div>
  );
}
