import HeroStudio from "@/components/admin/hero/HeroStudio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AdminHeroStudioPage() {
  return (
    <div className="w-full min-w-0 text-white">
      <HeroStudio />
    </div>
  );
}
