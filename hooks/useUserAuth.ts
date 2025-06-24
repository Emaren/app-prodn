// hooks/useUserAuth.ts
"use client";

// Re-export the hook that lives in your global context.
// All components that import from "@/hooks/useUserAuth"
// will now read exactly the same data (uid, isAdmin, etc.).
export { useUserAuth } from "@/context/UserAuthContext";
