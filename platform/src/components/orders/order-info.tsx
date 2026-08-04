import { DateTime } from "luxon";
import { Card } from "@/components/ui";
import type { Order } from "@/db/schema";
import { saveOrderInfoAction } from "@/lib/orders/detail-actions";
import { ORDER_TYPES, DATE_TYPES, SHIP_VIA_OPTIONS, ORDER_TYPE_LABEL, money2 } from "@/lib/reports/standard";

const TZ = "America/Denver";
const inp = "w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-brand";
const lbl = "text-xs font-medium text-neutral-500";

export function OrderInfoCard({
  order,
  reps,
  editable,
}: {
  order: Order;
  reps: { id: string; name: string }[];
  editable: boolean;
}) {
  const due = order.dueDate ? DateTime.fromJSDate(order.dueDate).setZone(TZ).toFormat("yyyy-LL-dd") : "";
  const repName = reps.find((r) => r.id === order.salesRepId)?.name;

  if (!editable) {
    return (
      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Order info</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className={lbl}>Type</dt><dd className="text-neutral-900">{order.orderType ? ORDER_TYPE_LABEL[order.orderType] ?? order.orderType : "—"}</dd></div>
          <div><dt className={lbl}>PO #</dt><dd className="text-neutral-900">{order.poNumber || "—"}</dd></div>
          <div><dt className={lbl}>Ship via</dt><dd className="text-neutral-900">{order.shipVia || "—"}</dd></div>
          <div><dt className={lbl}>Date type</dt><dd className="text-neutral-900">{order.dateType}</dd></div>
          <div><dt className={lbl}>Due date</dt><dd className="text-neutral-900">{due || "—"}</dd></div>
          <div><dt className={lbl}>Amount</dt><dd className="text-neutral-900">{money2(Number(order.amount ?? 0))}</dd></div>
          <div><dt className={lbl}>Sales rep</dt><dd className="text-neutral-900">{repName || "—"}</dd></div>
        </dl>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-1 text-sm font-semibold text-neutral-900">Order info</h2>
      <p className="mb-4 text-xs text-neutral-500">Commercial &amp; fulfillment details used by the Open Orders and Sales Analysis reports.</p>
      <form action={saveOrderInfoAction} className="grid gap-3 sm:grid-cols-4">
        <input type="hidden" name="id" value={order.id} />
        <label><span className={lbl}>Type</span>
          <select name="orderType" defaultValue={order.orderType ?? ""} className={`mt-1 ${inp}`}>
            <option value="">— type —</option>
            {ORDER_TYPES.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
          </select>
        </label>
        <label><span className={lbl}>PO #</span><input name="poNumber" defaultValue={order.poNumber ?? ""} className={`mt-1 ${inp}`} /></label>
        <label><span className={lbl}>Ship via</span>
          <input name="shipVia" list="ship-via-options" defaultValue={order.shipVia ?? ""} className={`mt-1 ${inp}`} />
          <datalist id="ship-via-options">{SHIP_VIA_OPTIONS.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label><span className={lbl}>Date type</span>
          <select name="dateType" defaultValue={order.dateType} className={`mt-1 ${inp}`}>
            {DATE_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label><span className={lbl}>Due date</span><input name="dueDate" type="date" defaultValue={due} className={`mt-1 ${inp}`} /></label>
        <label><span className={lbl}>Amount ($)</span><input name="amount" type="number" step="0.01" min="0" defaultValue={order.amount ?? "0"} className={`mt-1 ${inp}`} /></label>
        <label className="sm:col-span-2"><span className={lbl}>Sales rep</span>
          <select name="salesRepId" defaultValue={order.salesRepId ?? ""} className={`mt-1 ${inp}`}>
            <option value="">— unassigned —</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div className="sm:col-span-4"><button className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700">Save order info</button></div>
      </form>
    </Card>
  );
}
