"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

type User = {
  uid: string;
  in_game_name: string;
  verified: boolean;
};

export default function OnlineUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);

  const getIdToken = async (): Promise<string | null> => {
    const user = window.firebase?.auth?.()?.currentUser;
    return user?.getIdToken ? await user.getIdToken() : null;
  };

  useEffect(() => {
    const fetchOnlineUsers = async () => {
      const idToken = await getIdToken();

      try {
	const res = await fetch(`/api/user/online_users`, {
          headers: idToken
            ? { Authorization: `Bearer ${idToken}` }
            : undefined,
        });

        if (!res.ok) {
          console.error("Failed to fetch online users:", res.status);
          return;
        }

        const data = await res.json();
        setUsers(data);
      } catch (err) {
        console.error("❌ Error fetching users:", err);
      }
    };

    fetchOnlineUsers();
  }, []);

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">🟢 Online Users</h1>
      <ul className="space-y-4">
        {users.map((u) => (
          <li
            key={u.uid}
            className="bg-gray-800 p-4 rounded-lg shadow-md flex items-center justify-between"
          >
            <span>
              {u.in_game_name} {u.verified ? "✅" : "❌"}
            </span>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => alert(`Challenge sent to ${u.in_game_name}`)}
            >
              Challenge
            </Button>
          </li>
        ))}
      </ul>
      <div className="text-center mt-4">
        <Button
          className="bg-blue-700 hover:bg-blue-700 px-2 py-1 text-white"
          onClick={() => router.push("/")}
        >
          ⬅️ Back to Home
        </Button>
      </div>
    </div>
  );
}
