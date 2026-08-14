import { Providers } from "@/app/Providers";

export default function WoloWalletLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Providers>{children}</Providers>;
}
