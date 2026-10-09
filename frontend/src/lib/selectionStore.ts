import { create } from "zustand";

export type SelectionStatus = "loading" | "error" | "ready";

export type SelectionState = { status: SelectionStatus; selected: string | null };

export function initialSelectionState(): SelectionState {
  return { status: "loading", selected: null };
}

type Actions = {
  select: (ticker: string) => void;
  sync: (status: SelectionStatus, tickers: string[]) => void;
};

/** Which watchlist ticker the main chart shows; the watchlist panel keeps it in sync with its list. */
export const useSelectionStore = create<SelectionState & Actions>()((set) => ({
  ...initialSelectionState(),
  select: (ticker) => set({ selected: ticker }),
  sync: (status, tickers) =>
    set((s) => {
      if (status !== "ready") return { status };
      const kept = s.selected !== null && tickers.includes(s.selected);
      return { status, selected: kept ? s.selected : (tickers[0] ?? null) };
    }),
}));

export function resetSelectionStore() {
  useSelectionStore.setState(initialSelectionState());
}
