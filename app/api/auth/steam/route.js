import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions"; // make sure `@` is configured correctly, or use relative path

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
