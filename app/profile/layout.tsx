import { Providers } from "@/app/Providers";

/**
 * The E2 Mecha panel calls useWoloBalance (TanStack Query) while rendering.
 * /profile needs the same route-scoped QueryClient provider as /bets and /wolo.
 * Keep this boundary local: do not add wallet-query costs to every site route.
 */
export default function ProfileWalletLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Providers>{children}</Providers>;
}
