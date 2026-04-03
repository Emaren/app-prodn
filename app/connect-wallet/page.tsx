import WalletConnectorLoader from "@/components/WalletConnectorLoader";

export default function ConnectWalletPage() {
  return (
    <main className="min-h-screen space-y-4 bg-gray-900 p-6 text-white">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.35em] text-amber-200/70">Keplr Link</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Connect Your Wallet</h1>
      </header>

      <WalletConnectorLoader />
    </main>
  );
}
