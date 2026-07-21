"use client";

import { useEffect, useState } from "react";
import {
  AVAILABLE_MODELS,
  deleteModelCache,
  getDeviceInfo,
  getLoadedModelId,
  hasWebGpu,
  isLikelyTooLargeForDevice,
  isModelCached,
  isWebgpuOnly,
  type ModelCategory,
  type ModelId,
} from "@/lib/llm";
import { haptic } from "@/lib/haptics";

const CATEGORY_LABELS: Record<ModelCategory, string> = {
  tiny: "Tiny",
  balanced: "Balanced",
  powerful: "Powerful",
  coding: "Coding",
  math: "Math",
  reasoning: "Reasoning",
};

export default function ModelHub({
  active,
  onSelectModel,
}: {
  active: boolean;
  onSelectModel: (id: ModelId) => void;
}) {
  const [cached, setCached] = useState<Partial<Record<ModelId, boolean>>>({});
  const [webgpu, setWebgpu] = useState<boolean | null>(null);
  const [activeModelId, setActiveModelId] = useState<ModelId | null>(null);
  const [deletingId, setDeletingId] = useState<ModelId | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<ModelId | null>(null);
  const memoryGb = getDeviceInfo().memoryGb;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    hasWebGpu().then((v) => {
      if (!cancelled) setWebgpu(v);
    });
    const id = requestAnimationFrame(() => setActiveModelId(getLoadedModelId()));
    for (const m of AVAILABLE_MODELS) {
      isModelCached(m.id).then((isCached) => {
        if (!cancelled) setCached((prev) => ({ ...prev, [m.id]: isCached }));
      });
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [active]);

  async function handleDelete(id: ModelId) {
    setDeletingId(id);
    try {
      await deleteModelCache(id);
      setCached((prev) => ({ ...prev, [id]: false }));
    } finally {
      setDeletingId(null);
    }
  }

  function handleDeleteClick(id: ModelId) {
    if (confirmDeleteId === id) {
      haptic("warning");
      setConfirmDeleteId(null);
      handleDelete(id);
      return;
    }
    haptic("tap");
    setConfirmDeleteId(id);
    setTimeout(() => setConfirmDeleteId((cur) => (cur === id ? null : cur)), 4000);
  }

  return (
    <div className="h-full overflow-y-auto px-3 sm:px-5">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 py-6">
        <div className="mb-1">
          <h1 className="text-lg font-semibold tracking-tight">Model Hub</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            Browse and switch between models. Downloads happen once and everything runs on this
            device from then on.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {AVAILABLE_MODELS.map((m) => {
            const gpuLocked = webgpu === false && isWebgpuOnly(m);
            const isActive = m.id === activeModelId;
            const tooLarge = !gpuLocked && isLikelyTooLargeForDevice(m.sizeGB, memoryGb);
            return (
              <div
                key={m.id}
                className={`flex flex-col rounded-2xl border p-4 transition-colors ${
                  isActive ? "border-accent" : "border-border"
                } ${gpuLocked ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-foreground-muted">
                    {CATEGORY_LABELS[m.category]}
                  </span>
                  <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-foreground-muted">
                    ~{m.sizeGB}GB
                  </span>
                  {isActive && (
                    <span className="ml-auto shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                      Active
                    </span>
                  )}
                </div>
                <p className="mt-2 font-medium">{m.label.replace(/\s*\([^)]*\)\s*$/, "")}</p>
                {m.hubDescription && (
                  <p className="mt-1 text-sm text-foreground-muted">{m.hubDescription}</p>
                )}
                {gpuLocked && (
                  <p className="mt-1 text-xs text-amber-500">
                    Requires WebGPU, which isn&apos;t available on this device.
                  </p>
                )}
                {tooLarge && (
                  <p className="mt-1 text-xs text-amber-500">
                    May be too large for this device (~{memoryGb}GB RAM reported).
                  </p>
                )}
                <div className="mt-auto flex items-center gap-2 pt-3">
                  <button
                    type="button"
                    className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
                    onClick={() => {
                      haptic("tap");
                      onSelectModel(m.id);
                    }}
                    disabled={gpuLocked || isActive}
                  >
                    {isActive ? "In use" : cached[m.id] ? "Use this model" : "Download & use"}
                  </button>
                  {cached[m.id] && !isActive && (
                    <button
                      type="button"
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                        confirmDeleteId === m.id
                          ? "border-red-500 bg-red-500 text-white"
                          : "border-red-500/40 text-red-500 hover:bg-red-500 hover:text-white"
                      }`}
                      onClick={() => handleDeleteClick(m.id)}
                      disabled={deletingId === m.id}
                    >
                      {deletingId === m.id
                        ? "Deleting…"
                        : confirmDeleteId === m.id
                          ? "Tap to confirm"
                          : "Delete cache"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
