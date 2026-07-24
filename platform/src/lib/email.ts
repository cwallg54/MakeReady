import "server-only";

/**
 * Transactional email. A real provider (Resend/SES) is wired in a later phase.
 * Until RESEND_API_KEY is set, reset links are logged to the server console so
 * the flow is fully testable in development.
 */
export async function sendPasswordResetEmail(to: string, url: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.info(`[email:dev] Password reset for ${to}: ${url}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: "Reset your MakeReady password",
      html: `<p>A password reset was requested for your MakeReady account.</p>
             <p><a href="${url}">Reset your password</a> (link expires in 1 hour).</p>
             <p>If you did not request this, you can ignore this email.</p>`,
    }),
  });
  if (!res.ok) {
    console.error(`[email] Failed to send reset email: ${res.status} ${await res.text()}`);
  }
}
