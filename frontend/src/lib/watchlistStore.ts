import { create } from "zustand";
import type { WatchlistItem } from "./types";

export type WatchlistState = { pushed: WatchlistItem[] | null; seq: number };

export function initialWatchlistState(): WatchlistState {
  return { pushed: null, seq: 0 };
}

type Actions = { publish: (items: WatchlistItem[]) => void };

/** Push channel: a chat reply publishes the server's watchlist; WatchlistPanel owns the list and listens to seq. */
export const useWatchlistStore = create<WatchlistState & Actions>()((set) => ({
  ...initialWatchlistState(),
  publish: (items) => set((s) => ({ pushed: items, seq: s.seq + 1 })),
}));

export function resetWatchlistStore() {
  useWatchlistStore.setState(initialWatchlistState());
}
