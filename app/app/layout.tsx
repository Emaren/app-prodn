import { Providers } from "@/app/Providers";

export default function AppWalletLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Providers>{children}</Providers>;
}
