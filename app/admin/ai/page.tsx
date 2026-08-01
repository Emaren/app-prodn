import AiCommandCenter from "@/components/admin/ai/AiCommandCenter";
import BettingBotControlPanel from "@/components/admin/ai/BettingBotControlPanel";

export const dynamic = "force-dynamic";

export default function AdminAiPage() {
  return (
    <>
      <AiCommandCenter />
      <BettingBotControlPanel />
    </>
  );
}
