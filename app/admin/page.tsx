"use client";

import Link from "next/link";
import { useUserAuth } from "@/context/UserAuthContext";

export default function AdminPage() {
  const { isAuthenticated, isAdmin } = useUserAuth();

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-white">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
          <h1 className="text-3xl font-semibold">Admin</h1>
          <p className="mt-4 text-sm text-slate-300">
            Admin routes now sit behind the signed session model. Sign in first, then open the dedicated admin pages.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
          >
            Back To Lobby
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl py-10 text-white">
        <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
          <h1 className="text-3xl font-semibold">Admin</h1>
          <p className="mt-4 text-sm text-slate-300">
            Your account is signed in, but it does not have admin access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-10 text-white">
      <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-8">
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="mt-4 text-sm text-slate-300">
          Use the dedicated user management page for admin work.
        </p>
        <Link
          href="/admin/user-list"
          className="mt-6 inline-flex rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          Open User List
        </Link>
      </div>
    </div>
  );
}
