import { create } from "zustand";
import { getPortfolio } from "./api";
import type { Portfolio } from "./types";

export type PortfolioState = { portfolio: Portfolio | null; failed: boolean };

export function initialPortfolioState(): PortfolioState {
  return { portfolio: null, failed: false };
}

type Actions = { load: () => void; applyTrade: (portfolio: Portfolio) => void };

// A GET takes its ticket when it starts, a trade response when it arrives;
// a result is applied only if its ticket is newer than the last one applied.
let issued = 0;
let applied = 0;

export const usePortfolioStore = create<PortfolioState & Actions>()((set) => ({
  ...initialPortfolioState(),
  load: () => {
    const ticket = ++issued;
    getPortfolio()
      .then((portfolio) => {
        if (ticket <= applied) return;
        applied = ticket;
        set({ portfolio, failed: false });
      })
      .catch(() => {
        if (ticket > applied) set({ failed: true });
      });
  },
  applyTrade: (portfolio) => {
    applied = ++issued;
    set({ portfolio, failed: false });
  },
}));

export function resetPortfolioStore() {
  issued = 0;
  applied = 0;
  usePortfolioStore.setState(initialPortfolioState());
}
