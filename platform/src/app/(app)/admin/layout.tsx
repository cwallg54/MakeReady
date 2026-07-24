import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui";
import { AdminTabs } from "./admin-tabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <PageHeader title="Administration" description="Users, system configuration, and the audit trail." />
      <AdminTabs />
      {children}
    </div>
  );
}
