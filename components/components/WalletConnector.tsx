// components/WalletConnector.tsx
"use client";

import { useEffect, useState } from "react";
import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";
import { Button } from "@/components/ui/button";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

export default function WalletConnector() {
  const { status, address, connect, disconnect } = useKeplr();
  const [open, setOpen] = useState(false);
  const { data: balance } = useWoloBalance(address);

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

  useEffect(() => {
    if (!address) return;
    fetch("/api/user/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address }),
    }).catch((err) => console.error("User creation failed:", err));
  }, [address]);

  return (
    <>
      <Button onClick={onButtonClick}>
        {status === "connected"
          ? `${address.slice(0, 6)}…${address.slice(-4)}`
          : "Connect Wallet"}
      </Button>

      {status === "connected" && (
        <p className="mt-2 text-sm text-gray-400">
          Balance: {balance ? `${Number(balance) / 1_000_000} WOLO` : "Loading..."}
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
