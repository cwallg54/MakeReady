import Link from "next/link";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={`rounded-xl border border-neutral-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-neutral-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </Card>
  );
}

export function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="rounded-full border border-neutral-200 bg-white px-4 py-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {phase}
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-neutral-900">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-neutral-500">
        This module is on the delivery roadmap and will be built in a later phase. The navigation
        and access controls are already wired up for it.
      </p>
      <Link href="/dashboard" className="mt-6 text-sm font-medium text-neutral-900 underline">
        Back to dashboard
      </Link>
    </div>
  );
}
