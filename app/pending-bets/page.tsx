"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Bet = {
  challenger: string;
  betAmount: number;
  inactive?: boolean;
};


export default function PendingBetsPage() {
  const router = useRouter();
  const [pendingBets, setPendingBets] = useState<Bet[]>([]);

  // Load pending bets from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedBets = JSON.parse(localStorage.getItem("pendingBets") || "[]");
      setPendingBets(storedBets);
    }
  }, []);

  // Accept a bet and remove it from the list
  const handleAccept = (index: number) => {
    const updatedBets = pendingBets.filter((_, i) => i !== index);
    setPendingBets(updatedBets);
    localStorage.setItem("pendingBets", JSON.stringify(updatedBets));
  };

  // Toggle inactive state (greying out)
  const toggleInactive = (index: number) => {
    const updatedBets = pendingBets.map((bet, i) =>
      i === index ? { ...bet, inactive: !bet.inactive } : bet
    );
    setPendingBets(updatedBets);
    localStorage.setItem("pendingBets", JSON.stringify(updatedBets));
  };

  return (
    <div className="w-full min-h-screen bg-gray-900 text-white p-6 flex flex-col items-center">
      <h1 className="text-3xl font-bold mb-6">📌 Pending Bets ({pendingBets.length})</h1>

      {/* List of Pending Bets */}
      {pendingBets.length > 0 ? (
        pendingBets.map((bet, index) => (
          <Card 
            key={index}
            className={`w-full max-w-lg shadow-xl rounded-lg mb-4 transition-all ${
              bet.inactive ? "bg-gray-700 opacity-50" : "bg-gray-800"
            }`}
          >
                <Button 
           className="mt-4 bg-red-600 hover:bg-red-700 px-6 py-3" 
           onClick={() => {
         localStorage.removeItem("pendingBets");
         setPendingBets([]); // Update state to remove items immediately
      }}
    >
      🗑️ Clear Pending Bets
         </Button>

            <CardContent className="p-0 flex flex-col">
              <div className="p-6 text-center">
                <p className="text-xl font-semibold">Challenger: <span className="text-blue-400">{bet.challenger}</span></p>
                <p className="text-lg">Bet Amount: ${bet.betAmount}</p>
              </div>

              {/* Interactive left (green) and right (red) sections */}
              <div className="grid grid-cols-2">
                <button 
                  className="bg-green-600 hover:bg-green-700 p-4 w-full text-white font-bold transition-all"
                  onClick={() => handleAccept(index)}
                >
                  Accept
                </button>
                <button 
                  className="bg-red-600 hover:bg-red-700 p-4 w-full text-white font-bold transition-all"
                  onClick={() => toggleInactive(index)}
                >
                  {bet.inactive ? "Reactivate" : "Dismiss"}
                </button>
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <p className="text-gray-400 text-lg">No pending bets.</p>
      )}

      {/* Back Button */}
      <Button className="mt-6 bg-blue-600 hover:bg-blue-700 px-6 py-3" onClick={() => router.push("/")}>
        ⬅️ Back to Home
      </Button>
    </div>
  );
}
