import { Providers } from "@/app/Providers";

export default function StakingWalletLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Providers>{children}</Providers>;
}
