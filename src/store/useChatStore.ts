import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type MsgStatus = "streaming" | "done" | "error" | "stopped";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: MsgStatus;
  kind?: "level-prompt";
  pending?: string;
  feedback?: "up" | "down" | undefined;
  attachment?: { name: string; type: string };
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function titleFrom(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 42 ? `${t.slice(0, 40).trimEnd()}…` : t || "New chat";
}

interface ChatState {
  chats: Chat[];
  activeId: string | null;
  setActive: (id: string | null) => void;
  createChat: () => string;
  removeChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  addMessage: (chatId: string, m: ChatMessage) => void;
  updateMessage: (chatId: string, msgId: string, patch: Partial<ChatMessage>) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      chats: [],
      activeId: null,
      setActive: (activeId) => set({ activeId }),
      createChat: () => {
        const id = uid();
        set((s) => ({
          chats: [{ id, title: "New chat", messages: [], createdAt: Date.now() }, ...s.chats],
          activeId: id,
        }));
        return id;
      },
      removeChat: (id) =>
        set((s) => ({
          chats: s.chats.filter((c) => c.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        })),
      renameChat: (id, title) =>
        set((s) => ({
          chats: s.chats.map((c) => (c.id === id ? { ...c, title: title.trim() || c.title } : c)),
        })),
      addMessage: (chatId, m) =>
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id !== chatId
              ? c
              : {
                  ...c,
                  title:
                    c.messages.length === 0 && m.role === "user" ? titleFrom(m.content) : c.title,
                  messages: [...c.messages, m],
                },
          ),
        })),
      updateMessage: (chatId, msgId, patch) =>
        set((s) => ({
          chats: s.chats.map((c) =>
            c.id !== chatId
              ? c
              : {
                  ...c,
                  messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
                },
          ),
        })),
    }),
    {
      name: "eduai-chats",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
