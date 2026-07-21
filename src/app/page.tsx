"use client";

import { useRef, useState } from "react";
import Chat, { type ChatHandle } from "@/components/Chat";
import ChatHistory from "@/components/ChatHistory";
import Journal from "@/components/Journal";
import Settings from "@/components/Settings";
import TabSwitcher, { type TabId } from "@/components/TabSwitcher";

export default function Home() {
  const [tab, setTab] = useState<TabId>("chat");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const chatRef = useRef<ChatHandle>(null);

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="glass-bar relative z-10 flex items-center justify-between gap-2 px-3 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button
            aria-label="Chat history"
            className="glass-chip flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors hover:text-foreground"
            onClick={() => setHistoryOpen(true)}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 6h16M4 12h16M4 18h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/navo-wordmark.png" alt="Navo" className="h-5 w-auto shrink-0" />
        </div>
        <TabSwitcher active={tab} onChange={setTab} />
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
            active={tab === "settings"}
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
