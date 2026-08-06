import type { glAccountTypeEnum } from "@/db/schema";

export type GlAccountType = (typeof glAccountTypeEnum.enumValues)[number];

/** Display + accounting metadata per account type. Asset & expense accounts are
 *  debit-normal (a debit increases them); the rest are credit-normal. */
export const ACCOUNT_TYPES: { key: GlAccountType; label: string; plural: string; normal: "debit" | "credit"; statement: "balance_sheet" | "income_statement" }[] = [
  { key: "asset", label: "Asset", plural: "Assets", normal: "debit", statement: "balance_sheet" },
  { key: "liability", label: "Liability", plural: "Liabilities", normal: "credit", statement: "balance_sheet" },
  { key: "equity", label: "Equity", plural: "Equity", normal: "credit", statement: "balance_sheet" },
  { key: "revenue", label: "Revenue", plural: "Revenue", normal: "credit", statement: "income_statement" },
  { key: "expense", label: "Expense", plural: "Expenses", normal: "debit", statement: "income_statement" },
];

export const ACCOUNT_TYPE_MAP: Record<GlAccountType, (typeof ACCOUNT_TYPES)[number]> = Object.fromEntries(
  ACCOUNT_TYPES.map((t) => [t.key, t]),
) as Record<GlAccountType, (typeof ACCOUNT_TYPES)[number]>;

export function normalBalance(type: GlAccountType): "debit" | "credit" {
  return ACCOUNT_TYPE_MAP[type].normal;
}

/** Signed balance for an account given its debit/credit totals: positive means a
 *  normal balance on the account's natural side. */
export function accountBalance(type: GlAccountType, debit: number, credit: number): number {
  return normalBalance(type) === "debit" ? debit - credit : credit - debit;
}
