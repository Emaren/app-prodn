import RequestsBoard from "@/components/requests/RequestsBoard";

export const dynamic = "force-dynamic";

export default function RequestsPage() {
  return (
    <main className="space-y-4 py-2 text-white sm:space-y-6 sm:py-3">
      <RequestsBoard />
    </main>
  );
}
