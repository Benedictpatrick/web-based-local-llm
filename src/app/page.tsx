"use client";

import { useState } from "react";
import Chat from "@/components/Chat";
import Journal from "@/components/Journal";
import LogoMark from "@/components/Logo";

export default function Home() {
  const [tab, setTab] = useState<"chat" | "journal">("chat");

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-2 px-3 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <LogoMark className="h-4 w-4" />
          </div>
          <h1 className="truncate text-sm font-medium">Airgap</h1>
        </div>
        <nav className="flex shrink-0 gap-0.5 rounded-full bg-surface p-0.5 text-sm">
          <button
            className={`rounded-full px-2.5 py-1.5 transition-colors sm:px-3.5 ${
              tab === "chat"
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground-muted hover:text-foreground"
            }`}
            onClick={() => setTab("chat")}
          >
            Chat
          </button>
          <button
            className={`rounded-full px-2.5 py-1.5 transition-colors sm:px-3.5 ${
              tab === "journal"
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground-muted hover:text-foreground"
            }`}
            onClick={() => setTab("journal")}
          >
            Journal
          </button>
        </nav>
      </header>
      <main className="min-h-0 flex-1">
        {/* Both stay mounted so Chat keeps its loaded-model state when you
            switch to Journal and back — unmounting it would lose that
            component-local status even though the model stays in memory. */}
        <div className={tab === "chat" ? "h-full" : "hidden"}>
          <Chat />
        </div>
        <div className={tab === "journal" ? "h-full" : "hidden"}>
          <Journal />
        </div>
      </main>
    </div>
  );
}
