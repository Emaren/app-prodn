import RadioWoloDesk from "@/components/admin/radio/RadioWoloDesk";
import {
  requireServerRadioWoloOperator,
} from "@/lib/radioWoloOperator";

export const dynamic =
  "force-dynamic";

export default async function AdminRadioPage() {
  await requireServerRadioWoloOperator();

  return <RadioWoloDesk />;
}
