"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserAuth } from "@/hooks/useUserAuth";

export default function ProfilePage() {
  const router = useRouter();
  const { uid, playerName, setPlayerName, logout: contextLogout } = useUserAuth();
  const [email, setEmail] = useState("");
  const [passwordHash, setPasswordHash] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const isLoggedIn = !!uid;

  const logout = async () => {
    try {
      await contextLogout();
      localStorage.clear();
      window.dispatchEvent(new Event("storage"));
      // — unregister SW & clear all caches on logout

      if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {

        const reg = await navigator.serviceWorker.ready;

        await reg.unregister();

        const keys = await caches.keys();

        await Promise.all(keys.map(k => caches.delete(k)));

      }

      window.location.reload();
    } catch (err) {
      console.error("❌ Logout failed:", err);
      alert("Logout failed.");
    }
  };

  const registerUser = useCallback(
    async (userEmail: string) => {
      const in_game_name = localStorage.getItem("playerName") || playerName || "";

      if (!in_game_name) {
        console.warn("⛔ Skipping registration — missing in_game_name");
        return;
      }

      try {
        const res = await fetch("/api/user/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: userEmail, in_game_name }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Register failed: ${res.status} ${text}`);
        }

        console.log("🆕 User registered from active session");
      } catch (err) {
        console.error("❌ Failed to register user:", err);
      }
    },
    [playerName]
  );

  const fetchUser = useCallback(async () => {
    const fallbackEmail = localStorage.getItem("userEmail") || "unknown@aoe2hdbets.com";
    const payload = { email: fallbackEmail };
    console.log("🔍 Fetching user with active session");

    try {
      const res = await fetch("/api/user/me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 404) {
        console.warn("⚠️ No user found (404), retrying registration...");
        await registerUser(fallbackEmail);
        return;
      }

      if (!res.ok) {
        console.error("❌ Failed to fetch user:", res.status);
        return;
      }

      const data = await res.json();
      console.log("🧠 /api/user/me response:", data);

      if (data.in_game_name) {
        setPlayerName(data.in_game_name);
        localStorage.setItem("playerName", data.in_game_name);
      }
      if (data.email) setEmail(data.email);
      if (data.password_hash) setPasswordHash(data.password_hash);
      if (data.is_admin) setIsAdmin(data.is_admin);

      setIsVerified(!!data.verified);
    } catch (err) {
      console.error("❌ Exception in fetchUser:", err);
    }
  }, [registerUser, setPlayerName]);

  useEffect(() => {
    if (!uid || !isLoggedIn) {
      router.push("/");
      return;
    }

    fetchUser();
    window.addEventListener("focus", fetchUser);
    return () => window.removeEventListener("focus", fetchUser);
  }, [fetchUser, isLoggedIn, router, uid]);

  const handleSaveName = async () => {
    const trimmed = (playerName || "").trim();
    if (!trimmed) return alert("Enter a valid name.");

    localStorage.setItem("playerName", trimmed);

    try {
      const res = await fetch("/api/user/update_name", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ in_game_name: trimmed }),
      });

      if (res.status === 404) {
        alert("Please register first or check your UID.");
        return;
      }

      if (!res.ok) {
        throw new Error(`Update name failed: ${res.status}`);
      }

      const result = await res.json();
      alert(`Saved! Verified: ${result.verified}`);
      setIsVerified(result.verified);
      window.dispatchEvent(new Event("storage"));
    } catch (err) {
      console.error("❌ Update error:", err);
      alert("Name update likely worked, but verification check failed.");
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Profile</h1>
      <p className="mb-4">Manage your account details and preferences here.</p>

      <div className="mb-6">
        <label htmlFor="playerName" className="block text-lg mb-2">
          Player Name{" "}
          {playerName && (
            <span className={isVerified ? "text-green-400" : "text-yellow-400"}>
              {isVerified ? "✅ Verified" : "❌ Unverified"} ({playerName})
            </span>
          )}
        </label>
        <Input
          id="playerName"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          className="w-full px-4 py-3 text-lg rounded-md text-black"
          placeholder="Enter your in-game name"
        />
      </div>

      <Button className="mt-6 bg-blue-600 hover:bg-blue-700 px-6 py-3" onClick={handleSaveName}>
        Save Name
      </Button>

      <Button
        className="mt-6 bg-gray-600 hover:bg-gray-700 px-6 py-3 ml-4"
        onClick={() => router.push("/")}
      >
        ⬅️ Back to Home
      </Button>

      <div className="mt-10 border-t border-gray-500 pt-6">
        <h2 className="text-2xl font-semibold mb-4">Account Info</h2>
        <p className="mb-2"><strong>Email:</strong> {email || "unknown"}</p>
        <p className="mb-2"><strong>UID:</strong> {uid || "unknown"}</p>
        {isAdmin && (
          <p className="mb-2 text-blue-400 font-bold">🛡️ Admin Access Enabled</p>
        )}
        {passwordHash && (
          <p className="mb-2 text-yellow-300"><strong>Password Hash:</strong> {passwordHash}</p>
        )}
      </div>

      <div className="mt-10 border-t border-gray-500 pt-6">
        <h2 className="text-2xl font-semibold mb-4">Password</h2>
        <Button
          className="bg-yellow-600 hover:bg-yellow-700 px-6 py-3"
          onClick={() => {
            alert("Password reset is temporarily unavailable.");
          }}
        >
          🔐 Send Password Reset Email
        </Button>
      </div>

      <div className="mt-10 border-t border-gray-500 pt-6">
        <h2 className="text-2xl font-semibold mb-4">Session</h2>
        <Button
          className="bg-red-600 hover:bg-red-700 px-6 py-3"
          onClick={logout}
        >
          🚪 Log Out
        </Button>
      </div>
    </div>
  );
}
