import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { GeneratedDiagram, GeneratedDeck } from "@/lib/mock/creative";

interface CreativeState {
  diagrams: GeneratedDiagram[];
  decks: GeneratedDeck[];
  addDiagram: (diagram: GeneratedDiagram) => void;
  updateDiagram: (id: string, patch: Partial<GeneratedDiagram>) => void;
  removeDiagram: (id: string) => void;
  addDeck: (deck: GeneratedDeck) => void;
  updateDeck: (deck: GeneratedDeck) => void;
  removeDeck: (id: string) => void;
}

export const useCreativeStore = create<CreativeState>()(
  persist(
    (set) => ({
      diagrams: [],
      decks: [],
      addDiagram: (diagram) => set((state) => ({ diagrams: [diagram, ...state.diagrams] })),
      updateDiagram: (id, patch) =>
        set((state) => ({
          diagrams: state.diagrams.map((diagram) =>
            diagram.id === id ? { ...diagram, ...patch } : diagram,
          ),
        })),
      removeDiagram: (id) =>
        set((state) => ({ diagrams: state.diagrams.filter((diagram) => diagram.id !== id) })),
      addDeck: (deck) => set((state) => ({ decks: [deck, ...state.decks] })),
      updateDeck: (deck) =>
        set((state) => ({ decks: state.decks.map((item) => (item.id === deck.id ? deck : item)) })),
      removeDeck: (id) => set((state) => ({ decks: state.decks.filter((deck) => deck.id !== id) })),
    }),
    {
      name: "eduai-creative",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
