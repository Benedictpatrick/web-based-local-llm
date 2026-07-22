"use client";

import { useState } from "react";
import {
  getDeviceInfo,
  hasWebGpu,
  modelDisplayParts,
  recommendModel,
  type ModelId,
  type ModelPurpose,
  type ModelRecommendation,
  type SpeedPreference,
} from "@/lib/llm";
import BrandMark from "@/components/BrandMark";
import { haptic } from "@/lib/haptics";

const PURPOSE_OPTIONS: { id: ModelPurpose; label: string; hint: string }[] = [
  { id: "general", label: "General chat", hint: "Everyday questions and conversation" },
  { id: "coding", label: "Coding help", hint: "Writing and debugging code" },
  { id: "math", label: "Math problems", hint: "Step-by-step math solving" },
  { id: "reasoning", label: "Reasoning & logic", hint: "Puzzles, shows its thinking" },
  { id: "explore", label: "Just trying it out", hint: "Smallest, fastest download" },
];

const SPEED_OPTIONS: { id: SpeedPreference; label: string; hint: string }[] = [
  { id: "fast", label: "Fastest replies", hint: "Smaller download, quicker answers" },
  { id: "balanced", label: "Balanced", hint: "Good mix of speed and quality" },
  { id: "quality", label: "Best quality", hint: "Bigger download, needs a decent device" },
];

// Only "general" has more than one reasonable pick, so that's the only path
// that asks a second question -- every other purpose maps to one specific
// model already, and a redundant question there would just add friction.
const NEEDS_SPEED_QUESTION: ModelPurpose = "general";

export default function ModelRecommender({
  open,
  onClose,
  onSelectModel,
}: {
  open: boolean;
  onClose: () => void;
  onSelectModel: (id: ModelId) => void;
}) {
  const [purpose, setPurpose] = useState<ModelPurpose | null>(null);
  const [recommendation, setRecommendation] = useState<ModelRecommendation | null>(null);

  // Reset happens here, at the point of closing, rather than in an effect
  // reacting to `open` -- avoids a synchronous setState-in-effect cascade
  // for state that's purely local UI (never needs to sync with `open` from
  // any path other than the ones that already call this).
  function handleClose() {
    onClose();
    setPurpose(null);
    setRecommendation(null);
  }

  async function finish(chosenPurpose: ModelPurpose, speed: SpeedPreference) {
    const webgpu = await hasWebGpu();
    const { memoryGb } = getDeviceInfo();
    setRecommendation(recommendModel(chosenPurpose, speed, webgpu, memoryGb));
  }

  function selectPurpose(id: ModelPurpose) {
    haptic("tap");
    setPurpose(id);
    if (id !== NEEDS_SPEED_QUESTION) {
      finish(id, "balanced");
    }
  }

  function selectSpeed(speed: SpeedPreference) {
    haptic("tap");
    if (purpose) finish(purpose, speed);
  }

  function reset() {
    haptic("tap");
    setPurpose(null);
    setRecommendation(null);
  }

  const step = recommendation ? "result" : purpose === NEEDS_SPEED_QUESTION ? "speed" : "purpose";

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={handleClose}
      />
      <div
        className={`fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 rounded-2xl border border-border bg-background p-5 shadow-lg transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        inert={!open}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {step === "result" ? "Recommended for you" : "Which model should I use?"}
          </h2>
          <button
            aria-label="Close"
            className="shrink-0 rounded-md p-1.5 text-foreground-muted hover:bg-surface hover:text-foreground"
            onClick={handleClose}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {step === "purpose" && (
          <div className="flex flex-col gap-2">
            {PURPOSE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-surface"
                onClick={() => selectPurpose(opt.id)}
              >
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className="block text-xs text-foreground-muted">{opt.hint}</span>
              </button>
            ))}
          </div>
        )}

        {step === "speed" && (
          <div className="flex flex-col gap-2">
            {SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-surface"
                onClick={() => selectSpeed(opt.id)}
              >
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className="block text-xs text-foreground-muted">{opt.hint}</span>
              </button>
            ))}
            <button
              type="button"
              className="mt-1 self-start text-xs text-foreground-muted hover:text-foreground hover:underline"
              onClick={reset}
            >
              ← Back
            </button>
          </div>
        )}

        {step === "result" && recommendation && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-accent bg-accent/10 px-3 py-3">
              <BrandMark provider={recommendation.model.provider} size={18} />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {modelDisplayParts(recommendation.model).name}
                </p>
                <p className="text-xs text-foreground-muted">
                  {modelDisplayParts(recommendation.model).meta}
                </p>
              </div>
            </div>
            <p className="text-sm text-foreground-muted">{recommendation.reason}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex-1 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
                onClick={() => {
                  haptic("tap");
                  onSelectModel(recommendation.model.id);
                  handleClose();
                }}
              >
                Use this model
              </button>
              <button
                type="button"
                className="rounded-full border border-border px-3 py-2 text-xs font-medium text-foreground-muted transition-colors hover:bg-surface"
                onClick={reset}
              >
                Start over
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
