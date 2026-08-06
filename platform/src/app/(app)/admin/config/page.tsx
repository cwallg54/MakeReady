import { db } from "@/db";
import { numberSeries } from "@/db/schema";
import { Card } from "@/components/ui";
import { SettingsForm } from "./settings-form";

export default async function ConfigPage() {
  const settings = await db.query.systemSettings.findFirst();
  const series = await db.select().from(numberSeries);

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <h2 className="mb-4 text-sm font-semibold text-neutral-900">Company &amp; system</h2>
        <SettingsForm
          companyName={settings?.companyName ?? "Great Mountain West"}
          legalName={settings?.legalName ?? ""}
          timezone={settings?.timezone ?? "America/Denver"}
          fiscalYearStartMonth={settings?.fiscalYearStartMonth ?? 1}
          sessionTimeoutMinutes={settings?.sessionTimeoutMinutes ?? 60}
          requireMfa={settings?.requireMfa ?? false}
          creditApprovalThreshold={Number(settings?.creditApprovalThreshold ?? 5000)}
          defaultTaxRatePct={Number(settings?.defaultTaxRate ?? 0) * 100}
        />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-neutral-900">Document number series</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Numbering for sales orders, invoices, and other documents. Consumed by the Sales and
          Finance modules in later phases.
        </p>
        {series.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-400">No number series defined yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="py-1 font-medium">Document type</th>
                <th className="py-1 font-medium">Prefix</th>
                <th className="py-1 font-medium">Next number</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.id} className="border-t border-neutral-100">
                  <td className="py-2">{s.documentType}</td>
                  <td className="py-2">{s.prefix}</td>
                  <td className="py-2">{String(s.nextNumber).padStart(s.padding, "0")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
