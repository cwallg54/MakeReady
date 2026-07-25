import { and, or, asc, eq, ilike, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { businessPartners } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/service";
import { canView, crmScopedToOwn } from "@/lib/rbac";

// Typeahead search for Business Partners (used by the quote customer picker).
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !canView(user.roles, "sales")) return new Response("Forbidden", { status: 403 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json([]);

  const conds: SQL[] = [or(ilike(businessPartners.companyName, `%${q}%`), ilike(businessPartners.bpNumber, `%${q}%`)) as SQL];
  if (crmScopedToOwn(user.roles)) conds.push(eq(businessPartners.ownerId, user.id));

  const rows = await db
    .select({ id: businessPartners.id, name: businessPartners.companyName, bpNumber: businessPartners.bpNumber })
    .from(businessPartners)
    .where(and(...conds))
    .orderBy(asc(businessPartners.companyName))
    .limit(20);

  return Response.json(rows);
}
