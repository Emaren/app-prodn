import AdminCommandTowerPage from "@/components/admin/command-tower/AdminCommandTowerPage";
import AdminNonfinancialDirectoryPage from "@/components/admin/command-tower/AdminNonfinancialDirectoryPage";
import { isNonfinancialPublicReadProfile } from "@/lib/nonfinancialPublicReadProfile";
import { requireServerAdmin } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

export default async function UserListPage() {
  if (isNonfinancialPublicReadProfile()) {
    // Reject nonadmin/guest before emitting any privileged directory UI.
    await requireServerAdmin();
    return <AdminNonfinancialDirectoryPage />;
  }
  // Keep development and 3030's original command surface unchanged.
  return <AdminCommandTowerPage />;
}
