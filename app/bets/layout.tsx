import { Providers } from "@/app/Providers";

export default function BetsWalletLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <Providers>{children}</Providers>;
}
