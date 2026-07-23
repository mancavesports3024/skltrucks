"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <h2 className="text-xl font-bold text-neutral-900">Something went wrong in admin</h2>
      <p className="mt-3 text-sm text-neutral-600">
        Try refreshing the page. If this keeps happening after clicking Add Truck or Edit, sign out,
        sign back in at{" "}
        <span className="font-medium">https://www.skltrucks.com/admin</span>, then try again.
      </p>
      {error?.message && (
        <p className="mt-4 break-words rounded bg-neutral-100 p-3 text-left text-xs text-neutral-700">
          {error.message}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 bg-[#fc0527] px-6 py-2.5 text-sm font-semibold uppercase text-white"
        >
          Try again
        </button>
        <a
          href="/admin"
          className="flex min-h-11 items-center justify-center border border-neutral-300 px-6 py-2.5 text-sm font-semibold uppercase"
        >
          Back to inventory
        </a>
      </div>
    </div>
  );
}
