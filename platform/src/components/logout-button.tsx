import { logoutAction } from "@/lib/auth/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button
        type="submit"
        className="rounded-md px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900"
      >
        Sign out
      </button>
    </form>
  );
}
