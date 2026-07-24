"use client";

import { useFormStatus } from "react-dom";

export function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  autoFocus,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
  defaultValue?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-300">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        defaultValue={defaultValue}
        className="w-full rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-neutral-400"
      />
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-60"
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function FormError({ message, details }: { message?: string; details?: string[] }) {
  if (!message) return null;
  return (
    <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
      <p>{message}</p>
      {details && details.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-xs">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
