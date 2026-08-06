import type { ReactNode } from "react";

/** Accounting number format: 2 decimals, thousands separators, negatives in
 *  parentheses, optional leading $. */
export function fmtAcct(n: number, dollar = false): string {
  const s = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const withD = dollar ? `$${s}` : s;
  return n < 0 ? `(${withD})` : withD;
}

/** Print styles: when printing, show only the #statement-print region (drops
 *  the app nav/sidebar) so it comes out as a clean one-page statement. */
export function StatementPrintStyles() {
  return (
    <style>{`@media print {
      body * { visibility: hidden !important; }
      #statement-print, #statement-print * { visibility: visible !important; }
      #statement-print { position: absolute; left: 0; top: 0; width: 100%; }
      .statement-paper { box-shadow: none !important; border: none !important; }
    }`}</style>
  );
}

/** A statement "page": white paper, serif type, centered company header. */
export function StatementDoc({ company, title, period, children }: { company: string; title: string; period: string; children: ReactNode }) {
  return (
    <div className="statement-paper mx-auto max-w-2xl rounded-lg border border-neutral-200 bg-white px-8 py-8 font-serif text-neutral-900 shadow-sm sm:px-12">
      <div className="mb-6 text-center">
        <h1 className="text-lg font-bold tracking-wide">{company}</h1>
        <h2 className="text-base">{title}</h2>
        <p className="text-sm text-neutral-500">{period}</p>
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/** One statement row: a label plus up to two right-aligned amount columns
 *  (inner = line items / group subtotals, outer = section & grand totals). */
function Row({ label, indent = 0, inner, outer, bold = false, muted = false }: {
  label: ReactNode; indent?: number; inner?: ReactNode; outer?: ReactNode; bold?: boolean; muted?: boolean;
}) {
  return (
    <div className={`flex items-baseline py-0.5 ${bold ? "font-semibold" : ""} ${muted ? "text-neutral-500" : ""}`}>
      <span className="flex-1" style={{ paddingLeft: `${indent * 1.25}rem` }}>{label}</span>
      <span className="w-36 shrink-0 text-right tabular-nums">{inner}</span>
      <span className="w-40 shrink-0 text-right tabular-nums">{outer}</span>
    </div>
  );
}

/** A bold section heading with no amount (e.g. "Assets", "Revenue"). */
export function SectionHead({ children, indent = 0 }: { children: ReactNode; indent?: number }) {
  return <Row label={children} indent={indent} bold />;
}

/** An individual account line — amount in the inner column. */
export function LineItem({ code, name, amount, indent = 1, dollar = false }: { code?: string; name: string; amount: number; indent?: number; dollar?: boolean }) {
  return (
    <Row
      indent={indent}
      label={<span>{code ? <span className="mr-2 text-neutral-400">{code}</span> : null}{name}</span>}
      inner={fmtAcct(amount, dollar)}
    />
  );
}

/** Subtotal for a group (ruled amount in the inner column). */
export function Subtotal({ label, amount, indent = 1 }: { label: string; amount: number; indent?: number }) {
  return (
    <Row
      indent={indent}
      label={<span className="italic text-neutral-600">{label}</span>}
      inner={<span className="border-t border-neutral-400 pt-0.5">{fmtAcct(amount)}</span>}
    />
  );
}

/** A section total (bold, ruled, in the outer column). */
export function SectionTotal({ label, amount, dollar = true }: { label: string; amount: number; dollar?: boolean }) {
  return <Row label={label} bold outer={<span className="border-t border-neutral-500 pt-0.5">{fmtAcct(amount, dollar)}</span>} />;
}

/** The headline result — bold, double-underlined in the outer column. */
export function GrandTotal({ label, amount }: { label: string; amount: number }) {
  return (
    <Row
      label={<span className="text-[15px]">{label}</span>}
      bold
      outer={<span className="border-t border-b-4 border-double border-neutral-800 px-0.5 py-0.5">{fmtAcct(amount, true)}</span>}
    />
  );
}

export function Spacer() {
  return <div className="h-3" />;
}
