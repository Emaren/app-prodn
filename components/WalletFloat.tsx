"use client";

import { useRouter } from "next/navigation";
import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";
import {
  deriveWoloBalanceReadState,
  formatMinimalDenomAmount,
} from "@/lib/woloBalanceRead";

export default function WalletFloat() {
  const router = useRouter();
  const { address, status } = useKeplr();
  const balance = useWoloBalance(address);
  const balanceState = deriveWoloBalanceReadState({
    connected: status === "connected",
    amount: balance.data,
    isLoading: balance.isLoading,
    isFetching: balance.isFetching,
    isError: balance.isError,
  });
  const formatted = formatMinimalDenomAmount(balance.data);

  const label =
    balanceState === "disconnected"
      ? "Connect WOLO"
      : balanceState === "loading"
        ? "Loading balance"
        : balanceState === "error"
          ? "Balance unavailable"
          : balanceState === "refreshing"
            ? `${formatted ? `${formatted} WOLO` : "Verified balance"} · refreshing`
            : balanceState === "success-zero"
              ? "0.00 WOLO · verified"
              : `${formatted} WOLO`;

  return (
    <div
      onClick={() => router.push("/wallet")}
      data-balance-state={balanceState}
      aria-live="polite"
      className="fixed bottom-4 right-4 bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg cursor-pointer z-50 flex items-center gap-2"
    >
      🪙 {label}
    </div>
  );
}
