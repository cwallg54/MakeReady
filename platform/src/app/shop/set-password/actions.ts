"use server";

import { redirect } from "next/navigation";
import { acceptCustomerInvite } from "@/lib/store/customer-auth";

export interface SetPwState {
  error?: string;
}

export async function setPasswordAction(_prev: SetPwState, formData: FormData): Promise<SetPwState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };
  const res = await acceptCustomerInvite(token, password);
  if ("error" in res) return { error: res.error };
  redirect("/shop/account");
}
