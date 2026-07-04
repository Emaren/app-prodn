import HeroImageTakeoverPanel from "@/components/admin/HeroImageTakeoverPanel";
import HeroStudio from "@/components/admin/hero/HeroStudio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function AdminHeroStudioPage() {
  return (
    <div className="space-y-6">
      <HeroImageTakeoverPanel />
      <HeroStudio />
    </div>
  );
}
