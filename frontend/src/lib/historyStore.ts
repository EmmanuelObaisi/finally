import { create } from "zustand";
import { getPortfolioHistory } from "./api";
import type { HistoryPoint } from "./types";

export type HistoryState = { history: HistoryPoint[] | null; failed: boolean };

export function initialHistoryState(): HistoryState {
  return { history: null, failed: false };
}

type Actions = { load: () => void };

// Same ticket rule as the portfolio store: a result is applied only if its
// ticket (taken when the GET starts) is newer than the last one applied.
let issued = 0;
let applied = 0;
let inFlight = 0;

export const useHistoryStore = create<HistoryState & Actions>()((set) => ({
  ...initialHistoryState(),
  load: () => {
    const ticket = ++issued;
    inFlight++;
    set({ failed: false });
    getPortfolioHistory()
      .then((history) => {
        if (ticket <= applied) return;
        applied = ticket;
        set({ history, failed: false });
      })
      .catch(() => {
        if (ticket > applied) set({ failed: true });
      })
      .finally(() => {
        inFlight--;
      });
  },
}));

/** True while any history GET is pending; the 30 s poll skips a tick then. */
export function isHistoryInFlight(): boolean {
  return inFlight > 0;
}

export function resetHistoryStore() {
  issued = 0;
  applied = 0;
  inFlight = 0;
  useHistoryStore.setState(initialHistoryState());
}
