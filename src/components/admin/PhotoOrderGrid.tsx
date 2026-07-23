"use client";

import { useState } from "react";
import AdminImage from "@/components/admin/AdminImage";

interface PhotoOrderGridProps {
  urls: string[];
  onChange: (urls: string[]) => void;
  onRemove: (url: string) => void;
}

export default function PhotoOrderGrid({ urls, onChange, onRemove }: PhotoOrderGridProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= urls.length || to >= urls.length) return;
    const next = [...urls];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overIndex !== index) setOverIndex(index);
  }

  function handleDrop(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex !== null) reorder(dragIndex, index);
    setDragIndex(null);
    setOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <>
      <p className="mb-3 text-sm text-neutral-600">
        <strong>Drag and drop</strong> to change order. The first photo is the{" "}
        <strong>main</strong> image on the website — drag any photo into the first spot to make it
        main.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {urls.map((url, index) => {
          const isDragging = dragIndex === index;
          const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;
          const isMain = index === 0;

          return (
            <div
              key={`${url}-${index}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onDragLeave={() => {
                if (overIndex === index) setOverIndex(null);
              }}
              className={`relative cursor-grab active:cursor-grabbing ${
                isDragging ? "opacity-40" : ""
              } ${isOver ? "scale-[1.02]" : ""}`}
            >
              <AdminImage
                src={url}
                boxClassName={`aspect-square w-full transition ${
                  isMain ? "ring-2 ring-[#fc0527] ring-offset-2" : ""
                } ${isOver ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
              />
              {isMain && (
                <span className="pointer-events-none absolute left-1 top-1 bg-[#fc0527] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  Main
                </span>
              )}
              <span className="pointer-events-none absolute bottom-1 left-1 bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {index + 1}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(url);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute right-1 top-1 bg-red-600 px-2 py-0.5 text-xs text-white"
                aria-label="Remove photo"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
