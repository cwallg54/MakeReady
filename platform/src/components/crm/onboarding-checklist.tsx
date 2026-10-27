import Link from "next/link";
import { setStageAction } from "@/lib/crm/actions";
import { sendWelcomeEmailAction } from "@/lib/crm/finance-actions";

/**
 * Customer setup checklist on the Business Partner page. It reads the state of
 * every onboarding step from data the page already loads and, for each step,
 * either performs it in place or jumps to the card on the page that does.
 * It adds no new rules: each step is done when the existing record says so.
 */
export interface OnboardingInput {
  bpId: string;
  stage: "lead" | "prospect" | "customer";
  createdAt: Date;
  hasContactEmail: boolean;
  hasAddress: boolean;
  hasAccountGroup: boolean;
  appStatus: "none" | "requested" | "completed";
  creditApproved: boolean;
  welcomeSent: boolean;
  portal: "none" | "invited" | "active";
  editable: boolean;
  /** May edit credit limit / terms on the account (Admin, Sales Manager, Finance). */
  canSetTerms: boolean;
  /** May send the welcome email (Finance / Admin). */
  canFinance: boolean;
}

type Status = "done" | "waiting" | "todo";
interface Step {
  key: string;
  title: string;
  detail: string;
  status: Status;
  href?: string;
  cta?: string;
  inline?: React.ReactNode;
  owner?: string;
}

const btn = "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-semibold sm:py-1.5";

export function OnboardingChecklist(p: OnboardingInput) {
  const steps: Step[] = [
    {
      key: "contact",
      title: "Primary contact with email",
      detail: p.hasContactEmail ? "On file." : "Add the person we quote and invoice.",
      status: p.hasContactEmail ? "done" : "todo",
      href: "#contacts",
      cta: "Contacts",
    },
    {
      key: "address",
      title: "Billing & shipping address",
      detail: p.hasAddress ? "On file." : "Add where we bill and ship.",
      status: p.hasAddress ? "done" : "todo",
      href: "#addresses",
      cta: "Addresses",
    },
    {
      key: "group",
      title: "Account group",
      detail: p.hasAccountGroup ? "Assigned — contract pricing is optional." : "Sets the customer's pricing tier.",
      status: p.hasAccountGroup ? "done" : "todo",
      href: p.hasAccountGroup ? `/crm/${p.bpId}/pricing` : "#details",
      cta: p.hasAccountGroup ? "Contract pricing" : "Account details",
    },
    {
      key: "application",
      title: "Credit or card application",
      detail:
        p.appStatus === "completed"
          ? "Returned by the customer."
          : p.appStatus === "requested"
            ? "Sent — waiting on the customer. Reminders go out automatically."
            : p.creditApproved
              ? "Not needed — terms are already set."
              : "Send the customer a secure link to apply.",
      status: p.appStatus === "completed" || (p.appStatus === "none" && p.creditApproved) ? "done" : p.appStatus === "requested" ? "waiting" : "todo",
      href: "#financial-docs",
      cta: p.appStatus === "requested" ? "Copy / email link" : "Request",
    },
    {
      key: "credit",
      title: "Credit limit & payment terms",
      detail: p.creditApproved ? "Approved." : p.canSetTerms ? "Set the limit and terms once the application is reviewed." : "Finance approves the limit and terms.",
      status: p.creditApproved ? "done" : "todo",
      href: p.canSetTerms ? "#details" : undefined,
      cta: "Set terms",
      owner: "Finance",
    },
    {
      key: "stage",
      title: "Mark as Customer",
      detail: p.stage === "customer" ? "Done." : `Currently a ${p.stage === "lead" ? "Lead" : "Prospect"}.`,
      status: p.stage === "customer" ? "done" : "todo",
      inline:
        p.stage !== "customer" && p.editable ? (
          <form action={setStageAction}>
            <input type="hidden" name="id" value={p.bpId} />
            <input type="hidden" name="stage" value="customer" />
            <button className={`${btn} w-full bg-neutral-900 text-white hover:bg-neutral-700 sm:w-auto`}>Mark as Customer</button>
          </form>
        ) : undefined,
    },
    {
      key: "welcome",
      title: "Welcome email",
      detail: p.welcomeSent ? "Sent." : p.canFinance ? "Tell the customer their account is approved." : "Finance sends this once the account is approved.",
      status: p.welcomeSent ? "done" : "todo",
      owner: "Finance",
      inline:
        !p.welcomeSent && p.canFinance ? (
          <form action={sendWelcomeEmailAction}>
            <input type="hidden" name="bpId" value={p.bpId} />
            <button className={`${btn} w-full border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 sm:w-auto`}>Send welcome</button>
          </form>
        ) : undefined,
    },
    {
      key: "portal",
      title: "Customer portal invite",
      detail: p.portal === "active" ? "Active." : p.portal === "invited" ? "Invited — waiting for them to set a password." : "Lets them see quotes, orders and invoices, and pay online.",
      status: p.portal === "active" ? "done" : p.portal === "invited" ? "waiting" : "todo",
      href: "#portal",
      cta: p.portal === "invited" ? "Re-send" : "Invite",
    },
  ];

  const done = steps.filter((s) => s.status === "done").length;
  const complete = done === steps.length;
  // Open for accounts still being set up; collapsed for long-standing customers
  // (e.g. those imported from SAP) so it never crowds an established account.
  const recent = createdWithinDays(p.createdAt, 45);
  const open = !complete && (p.stage !== "customer" || recent);
  const next = steps.find((s) => s.status === "todo");

  return (
    <details id="setup" open={open} className="group mb-6 scroll-mt-28 rounded-xl border border-neutral-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-neutral-900">Customer setup</h2>
          <p className="truncate text-xs text-neutral-500">
            {complete ? "All steps complete." : `${done} of ${steps.length} done${next ? ` · Next: ${next.title}` : ""}`}
          </p>
        </div>
        <div className="hidden h-2 w-28 overflow-hidden rounded-full bg-neutral-100 sm:block" aria-hidden>
          <div className={`h-full ${complete ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <span className="shrink-0 text-xs font-semibold text-neutral-700">{done}/{steps.length}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-neutral-400 transition-transform group-open:rotate-90" aria-hidden>
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </summary>
      <ol className="divide-y divide-neutral-100 border-t border-neutral-100">
        {steps.map((s, i) => (
          <li key={s.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <StatusDot status={s.status} n={i + 1} />
              <div className="min-w-0">
                <p className={`text-sm font-medium ${s.status === "done" ? "text-neutral-500" : "text-neutral-900"}`}>
                  {s.title}
                  {s.owner && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{s.owner}</span>}
                </p>
                <p className="text-xs text-neutral-500">{s.detail}</p>
              </div>
            </div>
            {s.status !== "done" && s.inline && <div className="pl-9 sm:pl-0">{s.inline}</div>}
            {s.status !== "done" && !s.inline && s.href && s.cta && <StepLink href={s.href}>{s.cta}</StepLink>}
            {s.status === "done" && s.key === "group" && s.href && <StepLink href={s.href} quiet>{s.cta}</StepLink>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function StepLink({ href, children, quiet }: { href: string; children: React.ReactNode; quiet?: boolean }) {
  const cls = quiet
    ? "pl-9 text-xs font-medium text-brand-ink hover:underline sm:pl-0"
    : `${btn} ml-9 border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50 sm:ml-0`;
  return href.startsWith("#") ? (
    <a href={href} className={cls}>{children} →</a>
  ) : (
    <Link href={href} className={cls}>{children} →</Link>
  );
}

function StatusDot({ status, n }: { status: Status; n: number }) {
  if (status === "done")
    return <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white" aria-label="Done">✓</span>;
  if (status === "waiting")
    return <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700" aria-label="Waiting">…</span>;
  return <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-neutral-300 text-xs font-semibold text-neutral-500">{n}</span>;
}

/** Server-rendered once per request, so reading the clock here is stable. */
function createdWithinDays(createdAt: Date, days: number): boolean {
  return Date.now() - createdAt.getTime() < days * 24 * 60 * 60 * 1000;
}
