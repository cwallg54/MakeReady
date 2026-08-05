import "server-only";

/**
 * Transactional email via Resend. Until RESEND_API_KEY + EMAIL_FROM are set,
 * messages are logged to the server console so flows are testable in dev.
 * Returns true if actually sent via the provider.
 */
export interface EmailAttachment {
  filename: string;
  content: string; // base64
}

async function sendEmail(to: string | string[], subject: string, html: string, attachments?: EmailAttachment[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.info(`[email:dev] To ${Array.isArray(to) ? to.join(", ") : to} — ${subject}${attachments?.length ? ` (+${attachments.length} attachment)` : ""}`);
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, ...(attachments?.length ? { attachments } : {}) }),
  });
  if (!res.ok) {
    console.error(`[email] send failed: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
}

/** Email a sales order to the customer with attachments (PDF + item image).
 *  Returns true if actually sent. */
export async function sendOrderEmail(to: string, orderNumber: string, attachments: EmailAttachment[]): Promise<boolean> {
  const hasImage = attachments.length > 1;
  return sendEmail(
    to,
    `Great Mountain West — Sales Order ${orderNumber}`,
    `<div style="font-family:system-ui,sans-serif;max-width:520px">
       <p>Hello,</p>
       <p>Please find your sales order <strong>${orderNumber}</strong> attached as a PDF${hasImage ? ", along with a preview image of your item" : ""}.</p>
       <p>Thank you for your business.</p>
       <p>— Great Mountain West (G54)</p>
     </div>`,
    attachments,
  );
}

/** Store order — confirmation to the customer. */
export async function sendStoreOrderConfirmation(
  to: string,
  orderNumber: string,
  items: { title: string; qty: number; lineTotal: number }[],
  total: number,
): Promise<boolean> {
  const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const rows = items.map((i) => `<tr><td style="padding:4px 0">${i.qty}× ${i.title}</td><td style="padding:4px 0;text-align:right">${money(i.lineTotal)}</td></tr>`).join("");
  return sendEmail(
    to,
    `Your G54 store order ${orderNumber}`,
    `<div style="font-family:system-ui,sans-serif;max-width:520px">
       <h2 style="margin:0 0 8px">Thanks for your order!</h2>
       <p>We've received order <strong>${orderNumber}</strong>. Our team will confirm it, calculate shipping and tax, and follow up. <strong>No payment was taken online.</strong></p>
       <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0">
         ${rows}
         <tr><td style="padding:8px 0 0;border-top:1px solid #e5e5e5;font-weight:600">Subtotal</td><td style="padding:8px 0 0;border-top:1px solid #e5e5e5;text-align:right;font-weight:600">${money(total)}</td></tr>
       </table>
       <p>— Great Mountain West (G54)</p>
     </div>`,
  );
}

/** Store order — internal alert to the store team. */
export async function sendStoreOrderStaffAlert(
  recipients: string[],
  orderNumber: string,
  contactName: string,
  total: number,
  isB2b: boolean,
  adminUrl: string,
): Promise<boolean> {
  if (recipients.length === 0) return false;
  const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return sendEmail(
    recipients,
    `New store order ${orderNumber} — ${money(total)}`,
    `<div style="font-family:system-ui,sans-serif;max-width:520px">
       <p>A new ${isB2b ? "B2B" : "public"} store order came in.</p>
       <p><strong>${orderNumber}</strong> · ${contactName} · ${money(total)}</p>
       <p><a href="${adminUrl}">Open the order →</a></p>
     </div>`,
  );
}

/** Reminder to a customer to complete a still-pending document (with the link). */
export async function sendDocumentChaseEmail(to: string, docLabel: string, url: string): Promise<boolean> {
  return sendEmail(
    to,
    `Reminder: your ${docLabel} for Great Mountain West`,
    `<div style="font-family:system-ui,sans-serif;max-width:520px">
       <p>Hello,</p>
       <p>We're still waiting on your <strong>${docLabel}</strong> to finish setting up your account with Great Mountain West.</p>
       <p>It only takes a couple of minutes — your information stays secure and never travels over email:</p>
       <p><a href="${url}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Complete your ${docLabel} →</a></p>
       <p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${url}</p>
       <p>Thank you,<br>Great Mountain West (G54)</p>
     </div>`,
  );
}

/** Welcome / account-approved email sent to a customer once they're set up. */
export async function sendCustomerWelcomeEmail(to: string, company: string, siteUrl: string): Promise<boolean> {
  return sendEmail(
    to,
    `Welcome to Great Mountain West`,
    `<div style="font-family:system-ui,sans-serif;max-width:520px">
       <h2 style="margin:0 0 8px">Welcome to Great Mountain West${company ? `, ${company}` : ""}!</h2>
       <p>Your account is set up and ready to go. Thank you for choosing Great Mountain West for your custom print &amp; production.</p>
       <p><strong>What happens next:</strong></p>
       <ul style="padding-left:18px;color:#333">
         <li>Your salesperson will send you a link to review and approve each quote.</li>
         <li>Once an order is placed, you'll get a live tracking link so you can watch it move from art through production to delivery — no need to call for status.</li>
         <li>Art proofs come to you as a secure link to approve online.</li>
       </ul>
       <p>Browse products and learn more at <a href="${siteUrl}">${siteUrl}</a>.</p>
       <p>We're glad to have you.</p>
       <p>— Great Mountain West (G54)</p>
     </div>`,
  );
}

/** Email a quote to the customer with a link to review, approve, or decline. */
export async function sendQuoteEmail(to: string, quoteNumber: string, total: string, approveUrl: string): Promise<boolean> {
  return sendEmail(
    to,
    `Great Mountain West — Quote ${quoteNumber}`,
    `<div style="font-family:system-ui,sans-serif;max-width:520px">
       <p>Hello,</p>
       <p>Your quote <strong>${quoteNumber}</strong> from Great Mountain West is ready — total <strong>${total}</strong>.</p>
       <p>Please review it and let us know if it's approved:</p>
       <p><a href="${approveUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Review &amp; approve your quote →</a></p>
       <p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${approveUrl}</p>
       <p>Thank you for your business.</p>
       <p>— Great Mountain West (G54)</p>
     </div>`,
  );
}

/** Email an invoice (PDF attachment) to the customer. Returns true if sent. */
export async function sendInvoiceEmail(to: string, invoiceNumber: string, dueLabel: string, balance: string, attachments: EmailAttachment[]): Promise<boolean> {
  return sendEmail(
    to,
    `Great Mountain West — Invoice ${invoiceNumber}`,
    `<div style="font-family:system-ui,sans-serif;max-width:520px">
       <p>Hello,</p>
       <p>Please find invoice <strong>${invoiceNumber}</strong> attached as a PDF. Balance due: <strong>${balance}</strong>${dueLabel ? `, due ${dueLabel}` : ""}.</p>
       <p>Thank you for your business.</p>
       <p>— Great Mountain West (G54)</p>
     </div>`,
    attachments,
  );
}

/** Email an AR statement (PDF attachment) to the customer. Returns true if sent. */
export async function sendStatementEmail(to: string, company: string, balance: string, attachments: EmailAttachment[]): Promise<boolean> {
  return sendEmail(
    to,
    `Great Mountain West — Account Statement`,
    `<div style="font-family:system-ui,sans-serif;max-width:520px">
       <p>Hello,</p>
       <p>Attached is the current account statement for <strong>${company}</strong>. Total balance due: <strong>${balance}</strong>.</p>
       <p>Please contact us with any questions.</p>
       <p>— Great Mountain West (G54)</p>
     </div>`,
    attachments,
  );
}

/** Email a scheduled report (CSV attachment) to its recipients. */
export async function sendReportEmail(recipients: string[], reportName: string, csvBase64: string, filename: string): Promise<boolean> {
  return sendEmail(
    recipients,
    `MakeReady report: ${reportName}`,
    `<div style="font-family:system-ui,sans-serif;max-width:520px">
       <p>Hello,</p>
       <p>Your scheduled report <strong>${reportName}</strong> is attached as a CSV.</p>
       <p>— Great Mountain West (G54)</p>
     </div>`,
    [{ filename, content: csvBase64 }],
  );
}

export async function sendPasswordResetEmail(to: string, url: string): Promise<void> {
  await sendEmail(
    to,
    "Reset your MakeReady password",
    `<p>A password reset was requested for your MakeReady account.</p>
     <p><a href="${url}">Reset your password</a> (link expires in 1 hour).</p>
     <p>If you did not request this, you can ignore this email.</p>`,
  );
}

/** Generic reminder/notification email (used by automation). Returns true if sent. */
export async function sendReminderEmail(to: string, subject: string, body: string): Promise<boolean> {
  const html = `<div style="font-family:system-ui,sans-serif;max-width:520px;white-space:pre-wrap">${body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}</div>`;
  return sendEmail(to, subject, html);
}

export async function sendWelcomeEmail(
  to: string,
  name: string,
  setPasswordUrl: string,
  loginUrl: string,
): Promise<void> {
  await sendEmail(
    to,
    "Welcome to MakeReady — set up your account",
    `<div style="font-family:system-ui,sans-serif;max-width:520px">
       <h2>Welcome to MakeReady${name ? `, ${name}` : ""}</h2>
       <p>An account has been created for you on <strong>MakeReady by G54</strong>, the production platform for commercial print &amp; production.</p>
       <p><strong>1.</strong> Set your password using the secure link below (expires in 7 days):</p>
       <p><a href="${setPasswordUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Set your password</a></p>
       <p><strong>2.</strong> Then sign in any time at <a href="${loginUrl}">${loginUrl}</a> with your email (<strong>${to}</strong>) and the password you chose.</p>
       <p style="color:#666;font-size:13px">If the button link expires, use “Forgot password?” on the sign-in page to get a new one.</p>
     </div>`,
  );
}
