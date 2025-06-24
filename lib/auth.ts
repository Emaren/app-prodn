import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "./firebase";
import { toast } from "sonner";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8002";

export async function loginOrRegister(playerName: string, password: string): Promise<string> {
  const trimmed = playerName.trim();
  const uid = localStorage.getItem("uid") || `uid-${crypto.randomUUID()}`;
  const emailLocal = trimmed.toLowerCase().replace(/\s+/g, "");
  const email = `${emailLocal}.${uid.slice(-6)}@aoe2hdbets.com`;

  localStorage.setItem("uid", uid);
  localStorage.setItem("userEmail", email);
  localStorage.setItem("userPassword", password);
  localStorage.setItem("playerName", trimmed); // ✅ Save player name too

  try {
    // Try Firebase login first
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    const loginUid = userCred.user.uid;
    localStorage.setItem("uid", loginUid);
    toast.success("✅ Logged in!");

    const dbRes = await fetch(`${API}/api/user/me`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: loginUid }),
    });

    if (dbRes.status === 404) {
      // Register in backend if user not found
      const registerRes = await fetch(`${API}/api/user/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: loginUid,
          email,
          in_game_name: trimmed,
        }),
      });

      if (!registerRes.ok) {
        toast.error("⚠️ Backend registration failed after login!");
        console.error("Backend registration error:", await registerRes.text());
      } else {
        toast.success("✅ Registered user in backend!");
      }
    }

    return loginUid;

  } catch (err: any) {
    if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
      // Create new Firebase user if not found
      const newUser = await createUserWithEmailAndPassword(auth, email, password);
      const newUid = newUser.user.uid;
      localStorage.setItem("uid", newUid);
      toast.success("✅ Created new account!");

      const registerRes = await fetch(`${API}/api/user/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: newUid,
          email,
          in_game_name: trimmed,
        }),
      });

      if (!registerRes.ok) {
        toast.error("⚠️ Backend registration failed after account creation!");
        console.error("Backend registration error:", await registerRes.text());
      } else {
        toast.success("✅ Registered new user in backend!");
      }

      return newUid;
    }

    console.error("❌ Firebase error:", err);
    toast.error("❌ Authentication failed");
    throw err;
  }
}
