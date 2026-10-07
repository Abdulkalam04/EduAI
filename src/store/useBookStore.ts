import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { BookDoc } from "@/lib/types";

interface BookState {
  docs: BookDoc[];
  setDocs: (docs: BookDoc[]) => void;
  add: (d: BookDoc) => void;
  remove: (id: string) => void;
}

export const useBookStore = create<BookState>()(
  persist(
    (set) => ({
      docs: [],
      setDocs: (docs) => set({ docs }),
      add: (d) => set((s) => ({ docs: [d, ...s.docs] })),
      remove: (id) => set((s) => ({ docs: s.docs.filter((d) => d.id !== id) })),
    }),
    { name: "eduai-book", storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);
