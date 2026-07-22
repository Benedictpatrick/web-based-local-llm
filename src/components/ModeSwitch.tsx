"use client";

import { useLayoutEffect, useRef, useState } from "react";

export type ChatMode = "navo" | "research";

const MODES: { id: ChatMode; label: string }[] = [
  { id: "navo", label: "Navo" },
  { id: "research", label: "Navo Research" },
];

/**
 * A 2-position switch between plain chat and Navo Research, deliberately
 * reusing TabSwitcher's exact sliding-pill visual (same .tab-switcher/
 * .tab-switcher__pill classes and glass filter, already defined once in
 * TabSwitcher.tsx and referenced by id, so no duplicate <svg><filter> is
 * needed here) so switching modes reads as switching between two distinct
 * experiences, not toggling a small option.
 */
export default function ModeSwitch({
  active,
  onChange,
  disabled,
}: {
  active: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}) {
  const navRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Partial<Record<ChatMode, HTMLButtonElement | null>>>({});
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);
  // Pointerdown fires synchronously, well before the mode-switch splash
  // mounts (and, on iOS, before CSS :active reliably kicks in on a plain
  // button) -- so a tap always gets an instant visual press, independent of
  // whether the actual switch is still 5s away from finishing.
  const [pressed, setPressed] = useState<ChatMode | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const nav = navRef.current;
      const btn = buttonRefs.current[active];
      if (!nav || !btn) return;
      const navRect = nav.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      setPill({ x: btnRect.left - navRect.left, width: btnRect.width });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active]);

  return (
    <div
      ref={navRef}
      role="tablist"
      aria-label="Navo mode"
      className="tab-switcher relative flex shrink-0 gap-0.5 rounded-full p-0.5 text-xs"
    >
      {pill && (
        <div
          className="tab-switcher__pill"
          style={{ transform: `translateX(${pill.x}px)`, width: pill.width }}
        />
      )}
      {MODES.map(({ id, label }) => (
        <button
          key={id}
          ref={(el) => {
            buttonRefs.current[id] = el;
          }}
          type="button"
          role="tab"
          aria-selected={active === id}
          disabled={disabled}
          className={`relative z-10 rounded-full px-2.5 py-1.5 font-medium whitespace-nowrap transition-all duration-100 disabled:opacity-50 sm:px-3 ${
            active === id ? "text-foreground" : "text-foreground-muted hover:text-foreground"
          }`}
          style={{ transform: pressed === id ? "scale(0.9)" : "scale(1)" }}
          onPointerDown={() => !disabled && setPressed(id)}
          onPointerUp={() => setPressed(null)}
          onPointerLeave={() => setPressed(null)}
          onPointerCancel={() => setPressed(null)}
          onClick={() => {
            if (id !== active) onChange(id);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
