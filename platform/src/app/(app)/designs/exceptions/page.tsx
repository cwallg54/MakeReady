import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { canDoArt } from "@/lib/art/access";
import { db } from "@/db";
import { designItems, baseDesigns, users } from "@/db/schema";
import { PageHeader, Card } from "@/components/ui";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ExceptionsPage() {
  const user = await requireUser();
  if (!canDoArt(user.roles)) redirect("/403");

  const rows = await db
    .select({ id: designItems.id, itemNumber: designItems.itemNumber, brandCode: designItems.brandCode, reason: designItems.exceptionReason, status: designItems.status, createdAt: designItems.createdAt, baseName: baseDesigns.name, by: users.name })
    .from(designItems)
    .leftJoin(baseDesigns, eq(designItems.baseDesignId, baseDesigns.id))
    .leftJoin(users, eq(designItems.createdBy, users.id))
    .where(and(eq(designItems.isException, true)))
    .orderBy(desc(designItems.createdAt));

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/designs" className="text-sm text-neutral-500 hover:text-neutral-900">← Design Library</Link>
      <PageHeader title="Design exceptions" description="Items created off the standard G54 path — ESM/legacy or manual overrides — with their justification." />
      <Card className="p-0 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-400"><tr><th className="px-4 py-2">Item #</th><th className="px-4 py-2">Design</th><th className="px-4 py-2">Brand</th><th className="px-4 py-2">Reason</th><th className="px-4 py-2">By</th></tr></thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-400">No exceptions. 🎉</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-neutral-50">
                <td className="px-4 py-2"><Link href={`/designs/${r.id}`} className="font-mono text-xs font-medium text-brand-ink hover:underline">{r.itemNumber}</Link></td>
                <td className="px-4 py-2 text-neutral-800">{r.baseName ?? "—"}</td>
                <td className="px-4 py-2"><span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">{r.brandCode}</span></td>
                <td className="px-4 py-2 text-neutral-600">{r.reason ?? "—"}</td>
                <td className="px-4 py-2 text-neutral-500">{r.by ?? "—"} · {fmtDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
