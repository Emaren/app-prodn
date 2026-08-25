export default function WarGraphLoading() {
  return (
    <div className="min-h-[72vh] animate-pulse pb-8 motion-reduce:animate-none" aria-label="Loading WarGraph">
      <div className="flex items-end justify-between gap-4 border-b border-amber-200/10 pb-5">
        <div className="space-y-3">
          <div className="h-5 w-28 rounded-full bg-emerald-300/[0.07]" />
          <div className="h-12 w-64 rounded-xl bg-amber-200/[0.09] sm:w-80" />
          <div className="h-4 w-72 max-w-[72vw] rounded bg-white/[0.045]" />
        </div>
        <div className="hidden h-11 w-80 rounded-xl bg-white/[0.045] sm:block" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[14rem_minmax(0,1fr)_16rem]">
        <div className="space-y-4">
          <div className="h-52 rounded-[1.3rem] border border-amber-200/10 bg-white/[0.025]" />
          <div className="h-44 rounded-[1.3rem] border border-white/[0.06] bg-white/[0.02]" />
        </div>
        <div className="aspect-square max-h-[64rem] rounded-[2rem] border border-amber-200/10 bg-[radial-gradient(circle_at_center,rgba(214,158,53,0.09),rgba(3,10,16,0.98)_64%)]" />
        <div className="space-y-4">
          <div className="h-64 rounded-[1.3rem] border border-amber-200/10 bg-white/[0.025]" />
          <div className="h-48 rounded-[1.3rem] border border-white/[0.06] bg-white/[0.02]" />
        </div>
      </div>
    </div>
  );
}
