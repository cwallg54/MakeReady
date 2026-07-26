import type { Role } from "@/db/schema";

/** The Art board is open to the art team, production, sales managers, and admins. */
export function canDoArt(roles: Role[]): boolean {
  return roles.some((r) => r === "admin" || r === "art" || r === "production" || r === "sales_manager");
}
