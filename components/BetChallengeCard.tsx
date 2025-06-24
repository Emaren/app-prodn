"use client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  betPending: boolean;
  challenger: string;
  opponent: string;
  setOpponent: (name: string) => void;
}

export default function BetChallengeCard({ betPending, challenger, opponent, setOpponent }: Props) {
  return (
    <Card className="w-full max-w-lg bg-gray-800 text-white shadow-xl rounded-lg">
      <CardContent className="p-8 flex flex-col items-center space-y-6">
        {betPending ? (
          <div className="text-2xl font-semibold text-center">
            <span className="text-blue-400">{challenger}</span> has challenged you!
          </div>
        ) : (
          <>
            <p className="text-gray-400 text-lg">Enter Opponent's Name:</p>
            <Input
              className="text-black w-full px-4 py-3 text-lg rounded-md"
              placeholder="Opponent's Steam Name"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
            />
            <Button className="mt-4 w-full text-lg bg-blue-600 hover:bg-blue-700 py-3">
              Challenge
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
