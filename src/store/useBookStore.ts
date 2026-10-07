import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { seedDocs, type BookDoc } from "@/lib/mock/book";

interface BookState {
  docs: BookDoc[];
  add: (d: BookDoc) => void;
  remove: (id: string) => void;
}

export const useBookStore = create<BookState>()(
  persist(
    (set) => ({
      docs: seedDocs,
      add: (d) => set((s) => ({ docs: [d, ...s.docs] })),
      remove: (id) => set((s) => ({ docs: s.docs.filter((d) => d.id !== id) })),
    }),
    { name: "eduai-book", storage: createJSONStorage(() => localStorage), skipHydration: true },
  ),
);
