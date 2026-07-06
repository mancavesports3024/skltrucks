"use client";

import { deleteProduct } from "@/app/admin/actions";

export default function DeleteButton({ id }: { id: string }) {
  async function handleDelete() {
    if (!confirm("Delete this truck from inventory?")) return;
    await deleteProduct(id);
  }

  return (
    <button onClick={handleDelete} className="text-red-600 hover:underline text-sm">
      Delete
    </button>
  );
}
