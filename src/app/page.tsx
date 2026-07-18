"use client";

import { useRef, useState } from "react";
import Chat, { type ChatHandle } from "@/components/Chat";
import ChatHistory from "@/components/ChatHistory";
import Journal from "@/components/Journal";
import Settings from "@/components/Settings";

export default function Home() {
  const [tab, setTab] = useState<"chat" | "notes" | "settings">("chat");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const chatRef = useRef<ChatHandle>(null);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between gap-2 px-3 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-1">
          <button
            aria-label="Chat history"
            className="shrink-0 rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
            onClick={() => setHistoryOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 6h16M4 12h16M4 18h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <h1 className="truncate text-base font-semibold tracking-tight">Navo</h1>
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
              tab === "notes"
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground-muted hover:text-foreground"
            }`}
            onClick={() => setTab("notes")}
          >
            Notes
          </button>
          <button
            className={`rounded-full px-2.5 py-1.5 transition-colors sm:px-3.5 ${
              tab === "settings"
                ? "bg-background text-foreground shadow-sm"
                : "text-foreground-muted hover:text-foreground"
            }`}
            onClick={() => setTab("settings")}
          >
            Settings
          </button>
        </nav>
      </header>
      <main className="min-h-0 flex-1">
        <div className={tab === "chat" ? "h-full" : "hidden"}>
          <Chat
            ref={chatRef}
            conversationId={conversationId}
            onConversationChange={setConversationId}
          />
        </div>
        <div className={tab === "notes" ? "h-full" : "hidden"}>
          <Journal />
        </div>
        <div className={tab === "settings" ? "h-full" : "hidden"}>
          <Settings
            onChangeModel={() => {
              setTab("chat");
              chatRef.current?.openModelPicker();
            }}
          />
        </div>
      </main>
      <ChatHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        currentConversationId={conversationId}
        onSelect={setConversationId}
        onNewChat={() => setConversationId(null)}
      />
    </div>
  );
}
