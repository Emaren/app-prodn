"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  playerName: string;
  setPlayerName: (name: string) => void;
  savePlayerName: () => void;
  loading: boolean;
}

export default function AuthNamePrompt({
  playerName,
  setPlayerName,
  savePlayerName,
  loading,
}: Props) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && playerName.trim()) {
      savePlayerName();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-6">
      <Card className="bg-gray-800 shadow-xl w-full max-w-md">
        <CardContent className="p-8 flex flex-col space-y-6">
          <h1 className="text-xl font-bold text-center">
            Welcome to the AoE2HD Betting App
          </h1>
          <p className="text-gray-300 text-center">
            Enter your in-game name to start betting:
          </p>
          <Input
            className="text-black px-4 py-3 text-lg rounded-md"
            placeholder="Your Steam/In-Game Name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={handleKeyDown} // ⏎ triggers save
          />
          <Button
            onClick={savePlayerName}
            disabled={loading || !playerName.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 py-3"
          >
            Continue
          </Button>
        </CardContent>
      </Card>
<a
  href="https://discord.gg/aK56aWQ5"
  target="_blank"
  rel="noopener noreferrer"
  className="inline-flex items-center space-x-2 text-white hover:text-blue-400 transition"
>
  <img src="/icons/discord.svg" alt="Discord" className="w-6 h-6" />
  <span>Our Discord</span>
</a>
    </div>
  );
}
