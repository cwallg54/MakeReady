"use client";

import { useState } from "react";
import { logQuoteEmailedAction } from "@/lib/sales/actions";

export function EmailQuoteButton({ quoteId, href, toEmail }: { quoteId: string; href: string; toEmail: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <a
      href={href}
      title={toEmail ? `Email to ${toEmail}` : "Opens your email client"}
      className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700"
      onClick={async (e) => {
        // Log to the customer's history first, then open the mail client.
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        try {
          await logQuoteEmailedAction(quoteId);
        } catch {
          /* ignore — still open the composer */
        }
        window.location.href = href;
      }}
    >
      ✉ Email to customer
    </a>
  );
}
