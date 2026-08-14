import { Providers } from "@/app/Providers";

export default function WalletLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Providers>{children}</Providers>;
}
