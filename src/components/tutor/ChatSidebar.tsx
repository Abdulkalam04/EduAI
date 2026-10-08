import { useMemo, useState } from "react";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, MessageSquare } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GradientButton, Shimmer } from "@/components/ui-custom";
import { useChatStore, type Chat } from "@/store/useChatStore";
import { useUiStore } from "@/store/useUiStore";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

function groupChats(chats: Chat[]) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const groups: Record<string, Chat[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    Older: [],
  };
  for (const c of chats) {
    const key =
      c.createdAt >= today
        ? "Today"
        : c.createdAt >= today - DAY
          ? "Yesterday"
          : c.createdAt >= today - 7 * DAY
            ? "Previous 7 days"
            : "Older";
    groups[key]!.push(c);
  }
  return Object.entries(groups).filter(([, v]) => v.length);
}

function Item({ chat, active, onPick }: { chat: Chat; active: boolean; onPick: () => void }) {
  const { renameChat, removeChat } = useChatStore();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(chat.title);
  if (editing)
    return (
      <input
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        aria-label="Rename chat"
        onBlur={() => {
          renameChat(chat.id, val);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setVal(chat.title);
            setEditing(false);
          }
        }}
        className="h-9 w-full rounded-lg border bg-background px-2.5 text-sm outline-none focus:border-primary"
      />
    );
  return (
    <div
      className={cn(
        "group relative flex items-center rounded-lg transition-colors",
        active ? "bg-accent-soft text-primary" : "hover:bg-muted",
      )}
    >
      <button onClick={onPick} className="flex-1 truncate px-2.5 py-2 text-left text-sm">
        {chat.title}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Chat options"
          className="mr-1 flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background"
        >
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-xl">
          <DropdownMenuItem
            onSelect={() => {
              setVal(chat.title);
              setEditing(true);
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => removeChat(chat.id)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ChatSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { chats, activeId, setActive, createChat } = useChatStore();
  const hydrated = useUiStore((s) => s.hydrated);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    return s
      ? chats.filter(
          (c) =>
            c.title.toLowerCase().includes(s) ||
            c.messages.some((m) => m.content.toLowerCase().includes(s)),
        )
      : chats;
  }, [chats, q]);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <GradientButton
        onClick={() => {
          createChat();
          onNavigate?.();
        }}
        className="w-full"
        title="New chat (Ctrl+Shift+O)"
      >
        <Plus className="h-4 w-4" />
        New chat
      </GradientButton>
      <label className="flex h-9 items-center gap-2 rounded-xl border bg-background px-3 text-sm focus-within:border-primary">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search chats"
          className="w-full bg-transparent outline-none"
          aria-label="Search chats"
        />
      </label>
      <div className="-mx-1 flex-1 overflow-y-auto px-1">
        {!hydrated ? (
          <div className="space-y-2 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <Shimmer key={i} className="h-8" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <MessageSquare className="h-5 w-5" />
            {q ? "No chats match your search." : "Your chats will appear here."}
          </div>
        ) : (
          groupChats(filtered).map(([label, list]) => (
            <div key={label} className="mb-3">
              <p className="mb-1 px-2.5 text-xs font-semibold text-muted-foreground/80">{label}</p>
              <div className="space-y-0.5">
                {list.map((c) => (
                  <Item
                    key={c.id}
                    chat={c}
                    active={c.id === activeId}
                    onPick={() => {
                      setActive(c.id);
                      onNavigate?.();
                    }}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
