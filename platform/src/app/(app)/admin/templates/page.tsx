import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { orderFormTemplates } from "@/db/schema";
import { Card } from "@/components/ui";
import { TemplateCreateForm } from "./template-create-form";

export default async function TemplatesPage() {
  const templates = await db.select().from(orderFormTemplates).orderBy(asc(orderFormTemplates.name));
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">New order-form template</h2>
        <TemplateCreateForm />
      </Card>
      <Card className="p-0">
        <div className="border-b border-neutral-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Templates ({templates.length})</h2>
          <p className="text-xs text-neutral-500">Product order forms available in the Quote Builder.</p>
        </div>
        <ul className="divide-y divide-neutral-100">
          {templates.length === 0 && <li className="px-5 py-6 text-center text-sm text-neutral-400">No templates yet.</li>}
          {templates.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <Link href={`/admin/templates/${t.id}`} className="font-medium text-neutral-900 hover:underline">{t.name}</Link>
                {!t.active && <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-600">inactive</span>}
                {t.description && <p className="text-xs text-neutral-500">{t.description}</p>}
              </div>
              <Link href={`/admin/templates/${t.id}`} className="text-sm text-neutral-600 hover:text-neutral-900">Edit</Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
