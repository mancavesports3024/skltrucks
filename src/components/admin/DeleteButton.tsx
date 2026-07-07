"use client";

import { deleteProduct } from "@/app/admin/actions";

interface DeleteButtonProps {
  id: string;
  className?: string;
}

export default function DeleteButton({ id, className = "" }: DeleteButtonProps) {
  async function handleDelete() {
    if (!confirm("Delete this truck from inventory?")) return;
    await deleteProduct(id);
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className={`text-red-600 hover:underline ${className}`}
    >
      Delete
    </button>
  );
}
