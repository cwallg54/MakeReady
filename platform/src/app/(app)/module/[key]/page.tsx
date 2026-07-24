import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth/guards";
import { MODULES, type ModuleKey } from "@/lib/rbac";
import { Placeholder } from "@/components/ui";

const PHASE_BY_MODULE: Partial<Record<ModuleKey, string>> = {
  crm: "Phase 2",
  sales: "Phase 2",
  web_store: "Phase 3",
  inventory: "Phase 4",
  jobs: "Phase 4",
  quality: "Phase 4",
  maintenance: "Phase 4",
  pos: "Phase 4",
  accounting: "Phase 5",
  controlling: "Phase 5",
  asset_accounting: "Phase 5",
  content_library: "Phase 6",
  workflows: "Phase 8",
  reports: "Phase 8",
};

export default async function ModulePlaceholderPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const module = MODULES.find((m) => m.key === key);
  if (!module) notFound();

  // Enforce the same RBAC that gates the nav item.
  await requireModule(module.key);

  return <Placeholder title={module.label} phase={PHASE_BY_MODULE[module.key] ?? "Roadmap"} />;
}
