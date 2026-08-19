import { syncAzureLibrary } from "@/lib/content/sync";
import { azureConfigured } from "@/lib/content/azure";

// Invoked by Vercel Cron (see platform/vercel.json). Secured by CRON_SECRET.
// Incrementally indexes the Azure Files share into the Content Library so files
// artists add/remove on the mapped drive show up automatically. No-op (and cheap)
// when Azure isn't configured.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  if (!azureConfigured()) return Response.json({ ok: true, skipped: "azure not configured", at: new Date().toISOString() });
  const res = await syncAzureLibrary(null);
  return Response.json({ ok: true, ...res, at: new Date().toISOString() });
}
