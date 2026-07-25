"use client";

import { useActionState } from "react";
import { submitDocumentAction, type DocState } from "@/lib/documents/actions";
import { sectionsFor, DOC_LABELS, CC_TERMS_TEXT, TERMS_TERMS_TEXT, type CustomerDocType, type DocField } from "@/lib/documents/meta";

const input = "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none focus:border-neutral-500";

function Field({ f, defaultCompany }: { f: DocField; defaultCompany?: string }) {
  const common = { name: f.name, required: f.required, className: input, defaultValue: f.name === "company" ? defaultCompany : undefined };
  return (
    <label className={`block ${f.half ? "" : "sm:col-span-2"}`}>
      <span className="mb-1 block text-xs font-medium text-neutral-600">{f.label}{f.required ? " *" : ""}</span>
      {f.type === "select" ? (
        <select {...common}>
          <option value="">— select —</option>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : f.type === "textarea" ? (
        <textarea {...common} rows={2} />
      ) : (
        <input {...common} type={f.type ?? "text"} />
      )}
    </label>
  );
}

export function ApplicationForm({ token, docType, defaultCompany }: { token: string; docType: CustomerDocType; defaultCompany?: string }) {
  const [state, action] = useActionState<DocState, FormData>(submitDocumentAction, {});
  const sections = sectionsFor(docType);
  const termsText = docType === "credit_card_application" ? CC_TERMS_TEXT : TERMS_TERMS_TEXT;

  if (state.ok) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
        <h1 className="text-lg font-semibold text-neutral-900">Thank you — received.</h1>
        <p className="mt-2 text-sm text-neutral-600">Your {DOC_LABELS[docType]} has been submitted to Great Mountain West. No further action is needed.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="token" value={token} />
      {state.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

      {sections.map((s) => (
        <div key={s.title} className="rounded-xl border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-neutral-900">{s.title}</h2>
          {s.note && <p className="mb-3 mt-0.5 text-xs text-neutral-500">{s.note}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {s.fields.map((f) => <Field key={f.name} f={f} defaultCompany={defaultCompany} />)}
          </div>
        </div>
      ))}

      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-neutral-900">Agreement &amp; Signature</h2>
        <p className="mt-2 rounded-md bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600">{termsText}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Signature (type your full name) *</span>
            <input name="signedName" required className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-600">Title</span>
            <input name="signedTitle" className={input} />
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-neutral-700">
          <input type="checkbox" name="agree" required className="mt-0.5 h-4 w-4" />
          <span>I have read and agree to the terms above, and certify the information provided is true and correct.</span>
        </label>
      </div>

      <button type="submit" className="w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-700">
        Submit {DOC_LABELS[docType]}
      </button>
    </form>
  );
}
