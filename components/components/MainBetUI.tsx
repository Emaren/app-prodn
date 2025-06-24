// components/MainBetUI.tsx
"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet } from "lucide-react";

export interface MainBetUIProps {
  betPending: boolean;
  betAmount: number;
  challenger: string;
  opponent: string;
  setOpponent: React.Dispatch<React.SetStateAction<string>>;
  betStatus: string;
  showButtons: boolean;
  handleAccept: () => void;
  handleDecline: () => void;
  handleChallenge: () => void;
  pendingBets: any[];
  router: any;
  menuOpen: boolean;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  playerName: string;
}

export default function MainBetUI({
  betPending,
  betAmount,
  challenger,
  opponent,
  setOpponent,
  betStatus,
  showButtons,
  handleAccept,
  handleDecline,
  handleChallenge,
  pendingBets,
  router,
  menuOpen,
  setMenuOpen,
  playerName,
}: MainBetUIProps) {
  return (
    <div className="relative w-full min-h-screen flex flex-col bg-gray-900 text-white">
      {/* Wallet button */}
      <button className="fixed bottom-6 right-6 bg-gray-700 hover:bg-gray-600 p-4 rounded-full shadow-md">
        <Wallet className="w-7 h-7" />
      </button>

      <div className="flex flex-col flex-1 items-center justify-center px-6 w-full max-w-2xl mx-auto space-y-14">
        <motion.div
          animate={{
            opacity: betPending ? 1 : 0.8,
            scale: betPending ? 1.1 : 1,
          }}
          transition={{
            duration: 0.5,
            repeat: betPending ? Infinity : 0,
            repeatType: "reverse",
          }}
          className="relative flex items-center justify-center w-64 h-64 md:w-72 md:h-72 bg-blue-700 rounded-full shadow-2xl text-5xl md:text-6xl font-bold"
        >
          AoE2
          {betPending && (
            <div className="absolute bottom-5 bg-red-500 text-white text-lg px-6 py-3 rounded-full shadow-md">
              ${betAmount} Bet Pending
            </div>
          )}
        </motion.div>

        <Card className="w-full max-w-lg bg-gray-800 text-white shadow-xl rounded-lg">
          <CardContent className="p-8 flex flex-col items-center space-y-6">
            {betPending ? (
              <div className="text-2xl font-semibold text-center">
                <span className="text-blue-400">{challenger}</span> has challenged you!
              </div>
            ) : (
              <>
                <p className="text-gray-400 text-lg">Welcome, <strong>{playerName}</strong>!</p>
                <p className="text-gray-400 text-lg">Enter Opponent's Name:</p>
                <Input
                  className="text-black w-full px-4 py-3 text-lg rounded-md"
                  placeholder="Opponent's Steam Name"
                  value={opponent}
                  onChange={(e) => setOpponent(e.target.value)}
                />
                <Button
                  className="mt-4 w-full text-lg bg-blue-600 hover:bg-blue-700 py-3"
                  onClick={handleChallenge}
                >
                  Challenge
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {betStatus && (
          <motion.div
            className="text-2xl font-bold text-center bg-gray-800 px-6 py-3 rounded-lg shadow-md"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
          >
            {betStatus}
          </motion.div>
        )}

        <AnimatePresence>
          {betPending && showButtons && (
            <motion.div
              className="w-full flex gap-4 px-6 mt-6"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2 }}
            >
              <Button
                className="bg-green-600 hover:bg-green-700 px-6 py-3 flex-grow w-2/3"
                onClick={handleAccept}
              >
                Accept
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 px-6 py-3 flex-grow w-2/3"
                onClick={handleDecline}
              >
                Decline
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
