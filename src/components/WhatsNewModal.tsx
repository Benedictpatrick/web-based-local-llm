"use client";

import { useState } from "react";
import { haptic } from "@/lib/haptics";

/** Bump this when announcing something new so it shows again even for users
 *  who already passed the window for an earlier announcement. */
const WHATS_NEW_KEY = "navo:whats-new:research-v1:first-seen-at";
const SHOW_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** True on every app open during the first two days after the user's first
 *  ever open following this announcement, false forever once that's over. */
export function shouldShowWhatsNew(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(WHATS_NEW_KEY);
  const firstSeenAt = stored ? Number(stored) : Date.now();
  if (!stored) window.localStorage.setItem(WHATS_NEW_KEY, String(firstSeenAt));
  return Date.now() - firstSeenAt < SHOW_WINDOW_MS;
}

export default function WhatsNewModal({
  open,
  onClose,
  onTry,
}: {
  open: boolean;
  onClose: () => void;
  onTry: () => void;
}) {
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-x-4 top-1/2 z-50 mx-auto max-w-sm -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-background shadow-lg transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        inert={!open}
      >
        {!videoFailed && (
          <video
            className="aspect-video w-full bg-surface object-cover"
            src="/navo-research-intro.mp4"
            autoPlay
            loop
            muted
            playsInline
            onError={() => setVideoFailed(true)}
          />
        )}

        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-base font-semibold">Introducing Navo Research</h2>
            <button
              aria-label="Close"
              className="shrink-0 rounded-md p-1.5 text-foreground-muted hover:bg-surface hover:text-foreground"
              onClick={onClose}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <p className="text-sm text-foreground-muted">
            A new mode built for deep dives. Give it a topic and it breaks the
            question into smaller parts, can search the web for grounding,
            and pulls in your saved notes, all while keeping everything on
            this device.
          </p>

          <div className="mt-1 flex flex-col gap-2">
            <button
              type="button"
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
              onClick={() => {
                haptic("tap");
                onTry();
              }}
            >
              Try Navo Research
            </button>
            <button
              type="button"
              className="rounded-full px-4 py-2 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
              onClick={onClose}
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
