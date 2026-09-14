import { cookies } from "next/headers";
import { REMEMBER_EMAIL_COOKIE } from "@/lib/auth/service";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  // Prefills the email box only. Signing in still takes the password and,
  // where one is enrolled, the second factor — every time.
  const remembered = (await cookies()).get(REMEMBER_EMAIL_COOKIE)?.value;
  return <LoginForm resetDone={reset === "1"} defaultEmail={remembered} />;
}
