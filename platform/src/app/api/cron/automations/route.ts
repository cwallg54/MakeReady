import { runDueAutomations } from "@/lib/automation/engine";

// Invoked by Vercel Cron (see platform/vercel.json). Secured by CRON_SECRET:
// Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when the env var is set.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const fired = await runDueAutomations();
  return Response.json({ ok: true, fired, at: new Date().toISOString() });
}
