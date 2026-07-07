"use client";

import { useState } from "react";
import { updatePassword } from "@/app/admin/actions";

const inputClass =
  "w-full min-h-11 border border-neutral-300 px-4 py-2.5 text-base sm:text-sm focus:border-[#fc0527] focus:outline-none focus:ring-1 focus:ring-[#fc0527]";
const labelClass = "mb-1 block text-sm font-semibold";

interface ChangePasswordFormProps {
  email: string;
}

export default function ChangePasswordForm({ email }: ChangePasswordFormProps) {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const result = await updatePassword(formData);

    if (result?.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      e.currentTarget.reset();
    }

    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Account</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Signed in as <span className="font-medium text-neutral-900">{email}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 shadow">
        <h2 className="text-lg font-bold">Change Password</h2>
        <p className="text-sm text-neutral-600">
          Choose a strong password with at least 8 characters.
        </p>

        <div>
          <label htmlFor="currentPassword" className={labelClass}>
            Current password
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="newPassword" className={labelClass}>
            New password
          </label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className={labelClass}>
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && (
          <p className="text-sm text-green-700">Password updated successfully.</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="min-h-12 w-full bg-[#fc0527] px-8 py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] disabled:opacity-50 sm:w-auto"
        >
          {saving ? "Updating..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}
