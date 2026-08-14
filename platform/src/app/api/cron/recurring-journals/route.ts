import { runRecurringJournals } from "@/lib/accounting/recurring";

// Invoked by Vercel Cron (see platform/vercel.json). Secured by CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const res = await runRecurringJournals(new Date());
  return Response.json({ ok: true, ...res, at: new Date().toISOString() });
}
