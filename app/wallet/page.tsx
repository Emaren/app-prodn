import WalletDashboardLoader from "@/components/wolo/WalletDashboardLoader";

export default function WalletPage() {
  return (
    <main className="min-h-screen space-y-6 bg-gray-900 p-6 text-white">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.35em] text-amber-200/70">WoloChain Wallet</p>
        <h1 className="text-4xl font-semibold tracking-tight text-white">My Wallet</h1>
        <p className="max-w-2xl text-sm leading-6 text-slate-300">
          Connect Keplr, verify your active address, and keep your WOLO balance in view.
        </p>
      </header>

      <WalletDashboardLoader />
    </main>
  );
}
