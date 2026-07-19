"use client";

import { useLayoutEffect, useRef, useState } from "react";

export type TabId = "chat" | "notes" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "notes", label: "Notes" },
  { id: "settings", label: "Settings" },
];

export default function TabSwitcher({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
}) {
  const navRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);

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
      aria-label="Sections"
      className="tab-switcher relative flex shrink-0 gap-0.5 rounded-full p-0.5 text-sm"
    >
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="tab-glass" x="-30%" y="-60%" width="160%" height="220%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.01 0.12"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="2" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale="14"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
      {pill && (
        <div
          className="tab-switcher__pill"
          style={{ transform: `translateX(${pill.x}px)`, width: pill.width }}
        />
      )}
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          ref={(el) => {
            buttonRefs.current[id] = el;
          }}
          role="tab"
          aria-selected={active === id}
          className={`relative z-10 rounded-full px-2.5 py-1.5 transition-colors sm:px-3.5 ${
            active === id ? "text-foreground" : "text-foreground-muted hover:text-foreground"
          }`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
