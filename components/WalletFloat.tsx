"use client";

import { useRouter } from "next/navigation";
import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";

export default function WalletFloat() {
  const router = useRouter();
  const { address } = useKeplr();
  const { data: rawBalance } = useWoloBalance(address);

  const formatted = rawBalance
    ? (parseFloat(rawBalance) / 1_000_000).toFixed(2)
    : "0.00";

  return (
    <div
      onClick={() => router.push("/wallet")}
      className="fixed bottom-4 right-4 bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg cursor-pointer z-50 flex items-center gap-2"
    >
      🪙 {formatted} WOLO
    </div>
  );
}
