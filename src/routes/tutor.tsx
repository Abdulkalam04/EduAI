import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown, PanelLeftClose, PanelLeftOpen, History, Sparkles } from "lucide-react";
import "katex/dist/katex.min.css";
import { pageHead } from "@/components/ComingSoonPage";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ChatSidebar } from "@/components/tutor/ChatSidebar";
import { Composer } from "@/components/tutor/Composer";
import { MessageView, TypingDots } from "@/components/tutor/MessageView";
import { useChatStore, uid } from "@/store/useChatStore";
import { useUserStore, type LevelId } from "@/store/useUserStore";
import { useUiStore } from "@/store/useUiStore";
import { streamTutor } from "@/lib/api";
import type { AnswerStyle } from "@/lib/types";
import { Shimmer } from "@/components/ui-custom";

export const Route = createFileRoute("/tutor")({
  head: pageHead(
    "AI Tutor",
    "Ask any question and get explanations tuned to your class level, with maths, code and diagrams.",
  ),
  component: TutorPage,
});

const CHIP_TEXTS = new Set(["explain simpler", "give an example", "quiz me on this"]);

function TutorPage() {
  const { chats, activeId, createChat, addMessage, updateMessage } = useChatStore();
  const level = useUserStore((s) => s.level);
  const hydrated = useUiStore((s) => s.hydrated);
  const defaultStyle = useUiStore((s) => s.answerStyle);
  const [style, setStyle] = useState<AnswerStyle>(() => useUiStore.getState().answerStyle);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);

  useEffect(() => {
    if (hydrated) setStyle(defaultStyle);
  }, [defaultStyle, hydrated]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const streamChatRef = useRef<string | null>(null);

  const chat = chats.find((c) => c.id === activeId) ?? null;
  const messages = useMemo(() => chat?.messages ?? [], [chat?.messages]);
  const busy = streamingId !== null;

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const ask = useCallback(
    async (chatId: string, question: string, replaceId?: string) => {
      const msgs = useChatStore.getState().chats.find((c) => c.id === chatId)?.messages ?? [];
      const topic = [...msgs]
        .reverse()
        .find((m) => m.role === "user" && !CHIP_TEXTS.has(m.content.toLowerCase().trim()))?.content;
      const id = replaceId ?? uid();
      if (replaceId)
        updateMessage(chatId, id, { content: "", status: "streaming", feedback: undefined });
      else addMessage(chatId, { id, role: "assistant", content: "", status: "streaming" });
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      streamChatRef.current = chatId;
      setStreamingId(id);
      atBottomRef.current = true;
      setAtBottom(true);
      let acc = "";
      try {
        const { level: lvl } = useUserStore.getState();
        const { subject } = useUserStore.getState();
        for await (const chunk of streamTutor(
          {
            question,
            level: lvl,
            style,
            subject,
            session_id: chatId,
            ...(topic ? { topic } : {}),
          },
          ctrl.signal,
        )) {
          acc += chunk;
          updateMessage(chatId, id, { content: acc });
        }
        updateMessage(chatId, id, { status: "done" });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError")
          updateMessage(chatId, id, { status: "stopped" });
        else
          updateMessage(chatId, id, {
            status: "error",
            content: e instanceof Error ? e.message : "Something went wrong.",
          });
      } finally {
        setStreamingId(null);
        abortRef.current = null;
        streamChatRef.current = null;
      }
    },
    [addMessage, updateMessage, style],
  );

  const send = useCallback(
    (text: string, attachment?: { name: string; type: string }) => {
      if (busy) return;
      const chatId = useChatStore.getState().activeId ?? createChat();
      addMessage(chatId, {
        id: uid(),
        role: "user",
        content: text,
        ...(attachment ? { attachment } : {}),
      });
      if (!useUserStore.getState().levelSet) {
        addMessage(chatId, {
          id: uid(),
          role: "assistant",
          content: "Sure! What is your class?",
          status: "done",
          kind: "level-prompt",
          pending: text,
        });
        return;
      }
      void ask(chatId, text);
    },
    [busy, createChat, addMessage, ask],
  );

  useEffect(() => {
    const pendingQuestion = window.sessionStorage.getItem("eduai-pending-question");
    if (!pendingQuestion) return;
    window.sessionStorage.removeItem("eduai-pending-question");
    send(pendingQuestion);
  }, [send]);

  const questionBefore = (msgId: string) => {
    const i = messages.findIndex((m) => m.id === msgId);
    return [...messages.slice(0, i)].reverse().find((m) => m.role === "user")?.content ?? "";
  };

  const pickLevel = (lvl: LevelId, pending?: string) => {
    if (!chat) return;
    useUserStore.getState().set({ level: lvl });
    if (pending) void ask(chat.id, pending);
  };

  // Keyboard: Ctrl/Cmd+Shift+O new chat, Esc stops.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        createChat();
      }
      if (e.key === "Escape" && abortRef.current) abortRef.current.abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createChat]);

  // Stop streaming when switching to a different chat or leaving the page.
  useEffect(() => {
    if (streamChatRef.current && streamChatRef.current !== activeId) abortRef.current?.abort();
  }, [activeId]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = near;
    setAtBottom(near);
  };
  const jump = (smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => {
    if (atBottomRef.current) jump(false);
  }, [messages]);
  useEffect(() => {
    atBottomRef.current = true;
    setAtBottom(true);
    requestAnimationFrame(() => jump(false));
  }, [activeId]);

  const last = messages[messages.length - 1];

  return (
    <div
      className={`mx-0 flex min-h-0 overflow-hidden ${
        composerFocused
          ? "h-[calc(100dvh_-_3.5rem_-_env(safe-area-inset-top))] md:h-[calc(100dvh_-_7rem)]"
          : "h-[calc(100dvh_-_7rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] md:h-[calc(100dvh_-_7rem)]"
      }`}
    >
      {/* Desktop history panel */}
      <motion.aside
        animate={{ width: panelOpen ? 280 : 0, opacity: panelOpen ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 34 }}
        className="hidden shrink-0 overflow-hidden border-r bg-sidebar lg:block"
        aria-hidden={!panelOpen}
      >
        <div className="h-full w-[280px]">
          <ChatSidebar />
        </div>
      </motion.aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-[300px] p-0">
          <SheetTitle className="sr-only">Chat history</SheetTitle>
          <ChatSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-4 py-2 md:px-6">
          <button
            onClick={() => setPanelOpen((v) => !v)}
            aria-label={panelOpen ? "Hide chat history" : "Show chat history"}
            className="hidden rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:block"
          >
            {panelOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Chat history"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
          >
            <History className="h-4 w-4" />
          </button>
          <p className="truncate text-sm font-medium text-muted-foreground">
            {chat?.title ?? "New chat"}
          </p>
        </div>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-6"
        >
          <div className="mx-auto w-full max-w-[760px] py-4">
            {!hydrated ? (
              <div className="space-y-6 pt-8">
                {[0, 1, 2].map((i) => (
                  <Shimmer key={i} className={i % 2 ? "ml-auto h-10 w-1/2" : "h-24"} />
                ))}
              </div>
            ) : messages.length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-6 pb-4">
                {messages.map((m, i) =>
                  m.role === "assistant" && m.status === "streaming" && !m.content ? (
                    <TypingDots key={m.id} />
                  ) : (
                    <MessageView
                      key={m.id}
                      m={m}
                      isLast={i === messages.length - 1}
                      busy={busy}
                      onRegenerate={() => chat && ask(chat.id, questionBefore(m.id), m.id)}
                      onRetry={() => chat && ask(chat.id, questionBefore(m.id), m.id)}
                      onFeedback={(f) =>
                        chat &&
                        updateMessage(chat.id, m.id, { feedback: m.feedback === f ? undefined : f })
                      }
                      onChip={(t) => send(t)}
                      onPickLevel={(lvl) => pickLevel(lvl, m.pending)}
                    />
                  ),
                )}
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {!atBottom && last && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={() => {
                atBottomRef.current = true;
                setAtBottom(true);
                jump();
              }}
              className="absolute bottom-44 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium shadow-lift hover:bg-muted"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              Jump to latest
            </motion.button>
          )}
        </AnimatePresence>

        <div className="bg-gradient-to-t from-background via-background to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 md:px-6 md:pb-4">
          <div className="mx-auto w-full max-w-[760px]">
            <Composer
              streaming={busy}
              onSend={send}
              onStop={stop}
              style={style}
              setStyle={setStyle}
              onFocusChange={setComposerFocused}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center py-8 text-center">
      <motion.span
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow"
      >
        <Sparkles className="h-6 w-6" />
      </motion.span>
      <h2 className="mt-5 text-2xl font-bold sm:text-3xl">What would you like to learn today?</h2>
      <p className="mt-2 text-muted-foreground">Answers adapt to your learning level.</p>
    </div>
  );
}
