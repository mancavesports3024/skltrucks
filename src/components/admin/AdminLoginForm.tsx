"use client";

import { useState } from "react";
import { signIn } from "@/app/admin/actions";

export default function AdminLoginForm() {
  const [error, setError] = useState("");

  async function handleSubmit(formData: FormData) {
    const result = await signIn(formData);
    if (result?.error) setError(result.error);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-2xl font-bold">SKL Trucks Admin</h1>
        <p className="mb-8 text-sm text-neutral-500">Sign in to manage inventory</p>

        <form action={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold">Email</label>
            <input
              name="email"
              type="email"
              required
              className="w-full min-h-11 border border-neutral-300 px-4 py-2.5 text-base sm:text-sm focus:border-[#fc0527] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Password</label>
            <input
              name="password"
              type="password"
              required
              className="w-full min-h-11 border border-neutral-300 px-4 py-2.5 text-base sm:text-sm focus:border-[#fc0527] focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="min-h-12 w-full bg-[#fc0527] py-3 text-sm font-semibold uppercase text-white hover:bg-[#d90422] sm:w-auto"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
