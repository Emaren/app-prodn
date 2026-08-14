export default function GlobalRouteLoading() {
  return (
    <main
      className="min-h-[70vh] animate-pulse overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_18%_0%,rgba(56,189,248,0.09),transparent_34%),radial-gradient(circle_at_82%_4%,rgba(251,191,36,0.08),transparent_30%),rgba(2,6,23,0.82)] p-5 sm:p-7"
      aria-label="Loading page"
      aria-busy="true"
    >
      <div className="h-3 w-28 rounded-full bg-amber-200/15" />
      <div className="mt-5 h-10 max-w-xl rounded-2xl bg-white/10" />
      <div className="mt-3 h-4 max-w-2xl rounded-full bg-white/6" />

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
        <div className="min-h-[24rem] rounded-[1.7rem] border border-white/8 bg-white/[0.035]" />
        <div className="grid gap-4">
          <div className="min-h-[11rem] rounded-[1.7rem] border border-white/8 bg-white/[0.035]" />
          <div className="min-h-[11rem] rounded-[1.7rem] border border-white/8 bg-white/[0.035]" />
        </div>
      </div>
    </main>
  );
}
