import { runDueAutomations } from "@/lib/automation/engine";
import { detectAndEnroll } from "@/lib/automation/triggers";
import { chasePendingDocuments } from "@/lib/documents/chase";

// Invoked by Vercel Cron (see platform/vercel.json). Secured by CRON_SECRET:
// Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when the env var is set.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // 1) Auto-enroll accounts that entered a priority campaign's trigger, then
  // 2) fire any enrollment steps that are due, then
  // 3) chase customers who haven't returned a pending credit/CC application.
  const detected = await detectAndEnroll();
  const fired = await runDueAutomations();
  const chased = await chasePendingDocuments(new Date());
  return Response.json({ ok: true, detected: detected.enrolled, byCampaign: detected.byCampaign, fired, chased: chased.chased, at: new Date().toISOString() });
}
