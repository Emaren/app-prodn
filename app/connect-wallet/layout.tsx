import { Providers } from "@/app/Providers";

export default function ConnectWalletLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Providers>{children}</Providers>;
}
