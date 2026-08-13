import "server-only";

/**
 * Minimal Twilio SMS client. Reads TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
 * TWILIO_FROM from the environment; until those are set every SMS call degrades
 * gracefully (returns { ok:false } and logs) rather than throwing — so wiring
 * SMS into a flow never breaks the action that triggered it. No SDK dependency.
 */
export function smsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

export interface SmsResult {
  ok: boolean;
  sid?: string;
  error?: string;
}

/** Normalize a phone to E.164-ish (+1 default for 10-digit US numbers). */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export async function sendSms(to: string | null | undefined, body: string): Promise<SmsResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return { ok: false, error: "SMS isn’t set up (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM)." };
  const dest = normalizePhone(to);
  if (!dest) return { ok: false, error: "No valid destination number." };

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: dest, From: from, Body: body.slice(0, 1000) }).toString(),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[sms] send failed", res.status, t.slice(0, 300));
      return { ok: false, error: `SMS failed (${res.status}).` };
    }
    const data = (await res.json()) as { sid?: string };
    return { ok: true, sid: data.sid };
  } catch (e) {
    console.error("[sms] error", e);
    return { ok: false, error: "Couldn’t reach the SMS service." };
  }
}

/** Best-effort SMS to several recipients; never throws. Returns how many sent. */
export async function sendSmsBatch(numbers: (string | null | undefined)[], body: string): Promise<number> {
  if (!smsConfigured()) return 0;
  const uniq = Array.from(new Set(numbers.map(normalizePhone).filter((x): x is string => !!x)));
  let sent = 0;
  for (const n of uniq) {
    const r = await sendSms(n, body);
    if (r.ok) sent++;
  }
  return sent;
}
