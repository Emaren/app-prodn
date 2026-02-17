import type { User } from "@/lib/generated/prisma/client";

export function toUserApi(user: User) {
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    in_game_name: user.inGameName,
    verified: user.verified,
    wallet_address: user.walletAddress,
    lock_name: user.lockName,
    created_at: user.createdAt?.toISOString?.() ?? null,
    token: user.token,
    last_seen: user.lastSeen?.toISOString?.() ?? null,
    is_admin: user.isAdmin,
  };
}

