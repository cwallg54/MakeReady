import { NextRequest, NextResponse } from "next/server";

// Redirect the picker form (GET ?bpId=…) to the customer's credit report.
export async function GET(req: NextRequest) {
  const bpId = req.nextUrl.searchParams.get("bpId");
  const target = bpId ? `/reports/standard/credit/${bpId}` : "/reports/standard/credit";
  return NextResponse.redirect(new URL(target, req.nextUrl.origin));
}
