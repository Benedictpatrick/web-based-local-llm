"use client";

import { useEffect, useRef, useState } from "react";
import {
  AVAILABLE_MODELS,
  deleteModelCache,
  isModelCached,
  type ModelId,
} from "@/lib/llm";

export default function ModelPicker({
  value,
  onChange,
  disabled,
  onModelDeleted,
}: {
  value: ModelId;
  onChange: (id: ModelId) => void;
  disabled?: boolean;
  onModelDeleted?: (id: ModelId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cached, setCached] = useState<Partial<Record<ModelId, boolean>>>({});
  const [deletingId, setDeletingId] = useState<ModelId | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = AVAILABLE_MODELS.find((m) => m.id === value);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    for (const m of AVAILABLE_MODELS) {
      isModelCached(m.id).then((isCached) => {
        if (!cancelled) setCached((prev) => ({ ...prev, [m.id]: isCached }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleDelete(id: ModelId, label: string) {
    if (!window.confirm(`Delete the downloaded "${label}" model? You'll need to re-download it to use it again.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteModelCache(id);
      setCached((prev) => ({ ...prev, [id]: false }));
      onModelDeleted?.(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover disabled:opacity-50"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selected?.label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          className={`shrink-0 text-foreground-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-full z-10 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-background py-1.5 shadow-lg"
        >
          {AVAILABLE_MODELS.map((m) => (
            <div
              key={m.id}
              role="option"
              aria-selected={m.id === value}
              className={`group flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-surface ${
                m.id === value ? "text-foreground" : "text-foreground-muted"
              }`}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                <span className="truncate">{m.label}</span>
                {m.id === value && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0 text-accent">
                    <path
                      d="M20 6L9 17l-5-5"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
              {cached[m.id] && (
                <button
                  type="button"
                  aria-label={`Delete downloaded ${m.label}`}
                  className="shrink-0 rounded-md p-1 text-foreground-muted transition-colors hover:text-red-500 disabled:opacity-50"
                  disabled={deletingId === m.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(m.id, m.label);
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
