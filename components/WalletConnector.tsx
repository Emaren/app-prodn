// components/WalletConnector.tsx
"use client";

import { useState } from "react";
import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import {
  deriveWoloBalanceReadState,
  formatMinimalDenomAmount,
} from "@/lib/woloBalanceRead";

export default function WalletConnector() {
  const { status, address, connect, disconnect } = useKeplr();
  const [open, setOpen] = useState(false);
  const balance = useWoloBalance(address);
  const balanceState = deriveWoloBalanceReadState({
    connected: status === "connected",
    amount: balance.data,
    isLoading: balance.isLoading,
    isFetching: balance.isFetching,
    isError: balance.isError,
  });
  const formattedBalance = formatMinimalDenomAmount(balance.data);
  const balanceLabel =
    balanceState === "loading"
      ? "Loading verified balance..."
      : balanceState === "error"
        ? "Balance unavailable"
        : balanceState === "refreshing"
          ? `${formattedBalance ?? "Verified balance"} WOLO · refreshing`
          : balanceState === "success-zero"
            ? "0.00 WOLO · verified"
            : balanceState === "success-funded"
              ? `${formattedBalance} WOLO`
              : "Connect wallet";

  const onButtonClick = () => {
    if (status === "connected") {
      disconnect();
    } else {
      setOpen(true);
    }
  };

  const onConnect = async () => {
    try {
      await connect();
      setOpen(false);
    } catch (err) {
      console.error("Keplr connect failed:", err);
    }
  };

  return (
    <>
      <Button onClick={onButtonClick}>
        {status === "connected"
          ? `${address.slice(0, 6)}…${address.slice(-4)}`
          : "Connect Wallet"}
      </Button>

      {status === "connected" && (
        <p
          className={`mt-2 text-sm ${balanceState === "error" ? "text-red-300" : "text-gray-400"}`}
          data-balance-state={balanceState}
          aria-live="polite"
        >
          Balance: {balanceLabel}
        </p>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)}>
        <ModalHeader>Connect Your Keplr Wallet</ModalHeader>
        <ModalBody>
          <p>To place bets you need to connect your Keplr wallet.</p>
        </ModalBody>
        <ModalFooter>
          <Button onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={onConnect}>Connect Keplr</Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
