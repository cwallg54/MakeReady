import { runReorderAlerts } from "@/lib/inventory/reorder";

// Invoked by Vercel Cron (see platform/vercel.json). Secured by CRON_SECRET:
// Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when set.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const res = await runReorderAlerts(new Date());
  return Response.json({ ok: true, ...res, at: new Date().toISOString() });
}
