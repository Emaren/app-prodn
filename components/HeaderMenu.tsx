// components/HeaderMenu.tsx
"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useWoloBalance } from "@/hooks/useWoloBalance";
import { useKeplr } from "@/hooks/use-keplr";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useUserAuth } from "@/context/UserAuthContext";
import type firebase from "firebase/compat/app";

interface Props {
  pendingBetsCount: number;
  playerName: string;
  setPlayerName: (name: string) => void;
  uid: string | null;
}

export default function HeaderMenu({
  pendingBetsCount,
  playerName,
  setPlayerName,
  uid,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const { address } = useKeplr();
  const { data: rawBalance } = useWoloBalance(address);
  const menuRef = useRef<HTMLDivElement>(null);
  const { logout, isAdmin } = useUserAuth();

  useClickOutside(menuRef as React.RefObject<HTMLElement>, () =>
    setMenuOpen(false)
  );

  const handleLogout = async () => {
    try {
      await logout();
      setPlayerName("");
      localStorage.removeItem("playerName");
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("❌ Logout failed:", err);
      alert("Logout failed. Try again.");
    }
  };
  

  const navigate = (path: string) => {
    setMenuOpen(false);
    router.push(path);
  };

  return (
    <div className="relative flex gap-2 items-center" ref={menuRef}>
      <button
        className="bg-gray-700 hover:bg-gray-600 flex items-center gap-2 px-5 py-3 text-lg rounded-lg shadow-md"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <UserCircle className="w-6 h-6" />
        <AnimatePresence mode="wait">
        <motion.span key={playerName || "My Account"}>
          {playerName && playerName !== "My Account" ? playerName : "My Account"}
        </motion.span>
        </AnimatePresence>
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-14 w-56 bg-gray-800 rounded-lg shadow-lg z-50">
          <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => navigate("/profile")}>
            👤 Profile
          </button>

          {isAdmin && (
            <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => navigate("/admin/user-list")}>
              🛡️ Admin: User List
            </button>
          )}

          <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => navigate("/users")}>
            👥 Online Users
          </button>
          <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => navigate("/replay-parser")}>
            🧪 Parse Replay (Manual)
          </button>
          <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => navigate("/pending-bets")}>
            📌 Pending Bets ({pendingBetsCount})
          </button>
          <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => navigate("/upload")}>
            📤 Upload Replay
          </button>
          <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => navigate("/game-stats")}>
            📊 Game Stats
          </button>
          <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => navigate("/past-earnings")}>
            💰 Past Earnings
          </button>
          <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => navigate("/wallet")}>
            💼 My Wallet
          </button>
          <button className="w-full text-left px-4 py-2 hover:bg-gray-700" onClick={() => navigate("/settings")}>
            ⚙️ Settings
          </button>

          <button
            className="w-full text-left px-4 py-2 text-red-400 hover:bg-red-700"
            onClick={handleLogout}
          >
            🚪 Log Out
          </button>
        </div>
      )}
    </div>
  );
}
