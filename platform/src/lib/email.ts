import "server-only";

/**
 * Transactional email via Resend. Until RESEND_API_KEY + EMAIL_FROM are set,
 * messages are logged to the server console so flows are testable in dev.
 * Returns true if actually sent via the provider.
 */
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.info(`[email:dev] To ${to} — ${subject}\n${html}`);
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    console.error(`[email] send failed: ${res.status} ${await res.text()}`);
    return false;
  }
  return true;
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
       <p><strong>1.</strong> Set your password using the secure link below (expires in 1 hour):</p>
       <p><a href="${setPasswordUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Set your password</a></p>
       <p><strong>2.</strong> Then sign in any time at <a href="${loginUrl}">${loginUrl}</a> with your email (<strong>${to}</strong>) and the password you chose.</p>
       <p style="color:#666;font-size:13px">If the button link expires, use “Forgot password?” on the sign-in page to get a new one.</p>
     </div>`,
  );
}
