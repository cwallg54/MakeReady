import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 text-center">
      <p className="text-5xl font-black text-neutral-300">403</p>
      <h1 className="mt-2 text-lg font-semibold text-neutral-900">Access denied</h1>
      <p className="mt-1 max-w-sm text-sm text-neutral-500">
        You don&apos;t have permission to view this area. If you believe this is a mistake,
        contact your administrator.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-700"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
