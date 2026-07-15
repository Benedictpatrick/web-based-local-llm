"use client";

import { useState } from "react";
import Chat from "@/components/Chat";
import Journal from "@/components/Journal";

export default function Home() {
  const [tab, setTab] = useState<"chat" | "journal">("chat");

  return (
    <div className="flex h-dvh flex-col bg-white text-black dark:bg-black dark:text-white">
      <header className="flex items-center justify-between border-b border-black/10 px-4 py-3 dark:border-white/10">
        <h1 className="text-sm font-semibold">Offline Companion</h1>
        <nav className="flex gap-1 rounded-full bg-zinc-100 p-1 text-sm dark:bg-zinc-900">
          <button
            className={`rounded-full px-3 py-1 ${
              tab === "chat" ? "bg-black text-white dark:bg-white dark:text-black" : ""
            }`}
            onClick={() => setTab("chat")}
          >
            Chat
          </button>
          <button
            className={`rounded-full px-3 py-1 ${
              tab === "journal" ? "bg-black text-white dark:bg-white dark:text-black" : ""
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
