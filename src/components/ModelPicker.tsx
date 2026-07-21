"use client";

import { useEffect, useRef, useState } from "react";
import {
  AVAILABLE_MODELS,
  deleteModelCache,
  isModelCached,
  isWebgpuOnly,
  modelDisplayParts,
  type ModelId,
} from "@/lib/llm";
import BrandMark from "@/components/BrandMark";
import { haptic } from "@/lib/haptics";

export default function ModelPicker({
  value,
  onChange,
  disabled,
  onModelDeleted,
  onBrowseMore,
  variant = "default",
}: {
  value: ModelId;
  onChange: (id: ModelId) => void;
  disabled?: boolean;
  onModelDeleted?: (id: ModelId) => void;
  /** Opens the full Model Hub. When provided, the dropdown only lists the
   *  original baseline models plus anything already downloaded or active,
   *  instead of dumping all 18 catalog entries into a short list. */
  onBrowseMore?: () => void;
  /** "chip" renders a compact pill trigger (sparkle + label) for the chat
   *  header, instead of the full-width bordered box used elsewhere. */
  variant?: "default" | "chip";
}) {
  const [open, setOpen] = useState(false);
  const [cached, setCached] = useState<Partial<Record<ModelId, boolean>>>({});
  const [deletingId, setDeletingId] = useState<ModelId | null>(null);
  const [triggerWidth, setTriggerWidth] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = AVAILABLE_MODELS.find((m) => m.id === value);
  const selectedDisplay = selected ? modelDisplayParts(selected) : null;
  const listedModels = AVAILABLE_MODELS.filter(
    (m) => !isWebgpuOnly(m) || cached[m.id] || m.id === value,
  );

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
    const id = requestAnimationFrame(() => {
      if (triggerRef.current) setTriggerWidth(triggerRef.current.getBoundingClientRect().width);
    });
    return () => cancelAnimationFrame(id);
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
    if (!window.confirm(`Delete the downloaded "${label}" model? You'll need to download it again to use it.`)) {
      return;
    }
    haptic("warning");
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
    <div ref={rootRef} className="relative min-w-0">
      {variant === "chip" ? (
        <button
          ref={triggerRef}
          type="button"
          className="glass-chip flex min-w-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors hover:text-foreground disabled:opacity-50"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {selected && <BrandMark provider={selected.provider} size={13} />}
          <span className="truncate">{selectedDisplay?.name}</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
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
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover disabled:opacity-50"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected && <BrandMark provider={selected.provider} size={15} />}
            <span className="min-w-0">
              <span className="block truncate">{selectedDisplay?.name}</span>
              {selectedDisplay?.meta && (
                <span className="block truncate text-xs text-foreground-muted">
                  {selectedDisplay.meta}
                </span>
              )}
            </span>
          </span>
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
      )}

      {open && (
        <div
          role="listbox"
          style={triggerWidth ? { width: Math.max(triggerWidth, 200) } : undefined}
          className={`absolute top-full z-10 mt-2 max-h-[13.5rem] overflow-y-auto rounded-2xl border border-border bg-background py-1.5 shadow-lg ${
            triggerWidth ? "max-w-[90vw]" : variant === "chip" ? "w-64 max-w-[80vw]" : "w-72 max-w-[80vw]"
          }`}
        >
          {listedModels.map((m) => {
            const { name, meta } = modelDisplayParts(m);
            return (
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
                    haptic("tap");
                    onChange(m.id);
                    setOpen(false);
                  }}
                >
                  <BrandMark provider={m.provider} size={14} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{name}</span>
                    {meta && (
                      <span className="block truncate text-xs text-foreground-muted/70">{meta}</span>
                    )}
                  </span>
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
            );
          })}
          {onBrowseMore && (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm text-accent transition-colors hover:bg-surface"
              onClick={() => {
                haptic("tap");
                setOpen(false);
                onBrowseMore();
              }}
            >
              Browse more in Model Hub
            </button>
          )}
        </div>
      )}
    </div>
  );
}
