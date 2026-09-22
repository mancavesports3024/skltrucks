"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export const PREVIEW_IDLE_LABEL = "Preview";
export const PREVIEW_PENDING_LABEL = "Previewing workbook…";
export const PREVIEW_PENDING_STATUS = "Workbook received. Building preview…";

export const IMPORT_IDLE_LABEL = "Import previewed rows";
export const IMPORT_PENDING_LABEL = "Importing leads…";
export const IMPORT_PENDING_STATUS = "Import started. Please keep this page open.";

export type IntakeSubmitKind = "preview" | "import";

type SubmitButtonProps = {
  kind: IntakeSubmitKind;
  /** Extra disable when another intake operation is running. */
  locked?: boolean;
  className?: string;
};

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
      aria-hidden="true"
    />
  );
}

export function IntakeSubmitButton({ kind, locked = false, className }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const busy = pending || locked;
  const idle = kind === "preview" ? PREVIEW_IDLE_LABEL : IMPORT_IDLE_LABEL;
  const pendingLabel = kind === "preview" ? PREVIEW_PENDING_LABEL : IMPORT_PENDING_LABEL;
  const base =
    kind === "preview"
      ? "min-h-12 bg-neutral-900 px-6 py-3 text-sm font-semibold uppercase text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
      : "mt-3 min-h-12 bg-[#fc0527] px-6 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy}
      aria-disabled={busy}
      className={className ?? base}
    >
      <span className="inline-flex items-center gap-2">
        {pending ? <Spinner /> : null}
        {pending ? pendingLabel : idle}
      </span>
    </button>
  );
}

type PendingStatusProps = {
  kind: IntakeSubmitKind;
};

export function IntakePendingStatus({ kind }: PendingStatusProps) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  const message = kind === "preview" ? PREVIEW_PENDING_STATUS : IMPORT_PENDING_STATUS;
  return (
    <p
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="mt-3 flex items-center gap-2 text-sm font-medium text-neutral-800"
    >
      <span
        className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-neutral-400 border-t-neutral-800"
        aria-hidden="true"
      />
      {message}
    </p>
  );
}

type SuccessBannerProps = {
  children: ReactNode;
};

export function IntakeSuccessBanner({ children }: SuccessBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950"
    >
      {children}
    </div>
  );
}

type ErrorBannerProps = {
  message: string;
};

export function IntakeErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="border border-red-300 bg-red-50 p-4 text-sm text-red-900"
    >
      {message}
    </div>
  );
}
