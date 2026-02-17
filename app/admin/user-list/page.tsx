"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type User = {
  uid: string;
  email: string;
  in_game_name: string;
  verified: boolean;
  created_at: string;
  last_seen?: string; // ✅ NEW
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const getErrorMessage = (err: unknown): string =>
    err instanceof Error ? err.message : "Unknown error";

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error(`Error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      setUsers(data);
    } catch (err: unknown) {
      console.error("❌ Failed to fetch users:", err);
      setError(getErrorMessage(err));
    }
  }, []);

  const deleteUser = async (uid: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
      const res = await fetch(`/api/admin/delete_user/${uid}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      await fetchUsers(); // refresh list
    } catch (err) {
      console.error("❌ Delete failed:", err);
      alert("Delete failed.");
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">🛡 All Users</h1>
      {error && <p className="text-red-500 mb-4">Error: {error}</p>}

      <table className="w-full table-auto border border-collapse border-gray-100">
        <thead>
          <tr className="bg-gray-900">
            <th className="border px-4 py-2">UID</th>
            <th className="border px-4 py-2">Email</th>
            <th className="border px-4 py-2">In-Game Name</th>
            <th className="border px-4 py-2">Verified</th>
            <th className="border px-4 py-2">Created</th>
            <th className="border px-4 py-2">Last Seen</th> {/* ✅ NEW */}
            <th className="border px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.uid}>
              <td className="border px-4 py-2">{u.uid}</td>
              <td className="border px-4 py-2">{u.email}</td>
              <td className="border px-4 py-2">{u.in_game_name}</td>
              <td className="border px-4 py-2">{u.verified ? "✅" : "❌"}</td>
              <td className="border px-4 py-2">
                {u.created_at ? new Date(u.created_at).toLocaleString() : "Unknown"}
              </td>
              <td className="border px-4 py-2">
                {u.last_seen ? new Date(u.last_seen).toLocaleString() : "—"}
              </td>
              <td className="border px-4 py-2">
                <Button
                  className="bg-red-600 hover:bg-red-700 px-4 py-2"
                  onClick={() => deleteUser(u.uid)}
                >
                  🗑️ Delete
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
