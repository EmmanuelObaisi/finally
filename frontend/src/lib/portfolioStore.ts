import { create } from "zustand";
import type { Portfolio } from "./types";

export type PortfolioState = { portfolio: Portfolio | null; failed: boolean };

export function initialPortfolioState(): PortfolioState {
  return { portfolio: null, failed: false };
}

type Actions = { load: () => void; applyTrade: (portfolio: Portfolio) => void };

// RED skeleton: behavior arrives in the GREEN commit.
export const usePortfolioStore = create<PortfolioState & Actions>()(() => ({
  ...initialPortfolioState(),
  load: () => {},
  applyTrade: () => {},
}));

export function resetPortfolioStore() {
  usePortfolioStore.setState(initialPortfolioState());
}
