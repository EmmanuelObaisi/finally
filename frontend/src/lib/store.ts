import { create } from "zustand";
import type { ConnectionStatus, PriceFrame } from "./types";

/** Last non-flat move of a ticker since page load; seq restarts the CSS flash. */
export type Flash = { dir: "up" | "down" | "none"; seq: number };

export type MarketState = {
  prices: PriceFrame;
  status: ConnectionStatus;
  flash: Record<string, Flash>;
};

export function initialMarketState(): MarketState {
  return { prices: {}, status: "reconnecting", flash: {} };
}

function nextFlash(state: MarketState, frame: PriceFrame): Record<string, Flash> {
  const flash = { ...state.flash };
  for (const [ticker, update] of Object.entries(frame)) {
    const before = state.prices[ticker];
    const moved = update.direction === "up" || update.direction === "down";
    if (before && update.timestamp > before.timestamp && moved) {
      flash[ticker] = { dir: update.direction as "up" | "down", seq: (flash[ticker]?.seq ?? 0) + 1 };
    }
  }
  return flash;
}

/** Each frame replaces the price map, so a ticker missing from a frame disappears. */
export function applyFrame(state: MarketState, frame: PriceFrame): MarketState {
  return { ...state, prices: frame, flash: nextFlash(state, frame) };
}

type Actions = {
  receiveFrame: (frame: PriceFrame) => void;
  setStatus: (status: ConnectionStatus) => void;
};

export const useMarketStore = create<MarketState & Actions>()((set) => ({
  ...initialMarketState(),
  receiveFrame: (frame) => set((s) => applyFrame(s, frame)),
  setStatus: (status) => set({ status }),
}));
